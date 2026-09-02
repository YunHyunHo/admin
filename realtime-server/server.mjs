import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";

import Redis from "ioredis";
import pg from "pg";
import { WebSocket, WebSocketServer } from "ws";

const { Client, Pool } = pg;

const port = Number(process.env.PORT ?? 8080);
const databaseUrl = process.env.DATABASE_DIRECT_URL?.trim() ?? "";
const redisUrl = process.env.REDIS_URL?.trim() ?? "";
const sharedSecret = process.env.REALTIME_SERVER_SHARED_SECRET?.trim() ?? "";
const pushSecret = process.env.REALTIME_SERVER_PUSH_SECRET?.trim() ?? "";
const eventChannel = "admin_request_events";
const redisChannel = "admin:request-events:pubsub:v2";
const reconciliationIntervalMs = 30_000;
const heartbeatIntervalMs = 20_000;
const outboxRetentionDays = 30;
const batchSize = 500;

if (!databaseUrl || !redisUrl || sharedSecret.length < 32 || pushSecret.length < 32) {
  throw new Error(
    "DATABASE_DIRECT_URL, REDIS_URL, REALTIME_SERVER_SHARED_SECRET, REALTIME_SERVER_PUSH_SECRET 설정이 필요합니다.",
  );
}

const ssl = process.env.DATABASE_SSL === "false"
  ? false
  : { rejectUnauthorized: false };
const pool = new Pool({ connectionString: databaseUrl, ssl, max: 5 });
const redisPublisher = new Redis(redisUrl, {
  connectTimeout: 2_000,
  maxRetriesPerRequest: 2,
});
const redisSubscriber = new Redis(redisUrl, {
  connectTimeout: 2_000,
  maxRetriesPerRequest: null,
});
const clients = new Set();
let listenClient = null;
let listenReconnectTimer = null;
let listenReconnectDelayMs = 500;
let shuttingDown = false;
let databaseHealthy = false;
let listenHealthy = false;
let redisHealthy = false;

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sign(payload) {
  return createHmac("sha256", sharedSecret).update(payload).digest("base64url");
}

function verifyTicket(ticket) {
  const [payload, signature] = ticket.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(signature);

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);

    if (
      parsed.version !== 1 ||
      String(parsed.loginId).trim().toLowerCase() !== "maple" ||
      parsed.role !== "MASTER" ||
      !parsed.connectionId ||
      parsed.expiresAt < now ||
      parsed.issuedAt > now + 30
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function normalizeEventId(value) {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? normalized : null;
}

function parseEvent(value, eventId) {
  const event = typeof value === "string" ? JSON.parse(value) : value;
  const id = normalizeEventId(eventId ?? event?.eventId);

  if (
    !id ||
    !["charge", "domain_exchange", "distributor_withdrawal"].includes(event?.kind) ||
    typeof event.requestId !== "string" ||
    !["PENDING", "APPROVED", "REJECTED", "COMPLETED", "CANCELED"].includes(event.status)
  ) {
    return null;
  }

  return { ...event, eventId: id };
}

async function getLatestEventId() {
  const result = await pool.query(
    "select coalesce(max(id), 0)::text as id from admin_request_event_log",
  );
  databaseHealthy = true;
  return result.rows[0]?.id ?? "0";
}

async function getOldestRetainedEventId() {
  const result = await pool.query(
    "select coalesce(min(id), 0)::text as id from admin_request_event_log",
  );
  databaseHealthy = true;
  return result.rows[0]?.id ?? "0";
}

async function getEvent(eventId) {
  const result = await pool.query(
    "select id::text, event from admin_request_event_log where id = $1::bigint limit 1",
    [eventId],
  );
  databaseHealthy = true;
  const row = result.rows[0];
  return row ? parseEvent(row.event, row.id) : null;
}

async function getEventsAfter(eventId, limit = batchSize) {
  const result = await pool.query(
    `select id::text, event
       from admin_request_event_log
      where id > $1::bigint
      order by id asc
      limit $2`,
    [eventId, limit],
  );
  databaseHealthy = true;
  return result.rows.map((row) => parseEvent(row.event, row.id)).filter(Boolean);
}

function send(client, payload) {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(payload));
  }
}

function deliver(client, event, replayed = false) {
  if (!client.ready) {
    client.buffered.set(event.eventId, event);
    return;
  }

  if (BigInt(event.eventId) <= BigInt(client.lastDeliveredEventId)) {
    return;
  }

  send(client, { type: "request-event", event: { ...event, replayed } });
  client.lastDeliveredEventId = event.eventId;
}

function fanOut(event, replayed = false) {
  for (const client of clients) {
    deliver(client, event, replayed);
  }
}

async function publishEvent(event) {
  fanOut(event);

  try {
    await redisPublisher.publish(redisChannel, JSON.stringify(event));
    redisHealthy = true;
  } catch (error) {
    redisHealthy = false;
    console.error("[realtime] Redis publish failed", error.message);
  }
}

async function replayClient(client, requestedCursor) {
  const latest = await getLatestEventId();
  const oldest = await getOldestRetainedEventId();
  let cursor = requestedCursor;

  if (!cursor) {
    cursor = latest;
  } else if (oldest !== "0" && BigInt(cursor) < BigInt(oldest) - 1n) {
    send(client, { type: "resync-required", cursor: latest });
    cursor = latest;
  } else {
    while (!shuttingDown) {
      const events = await getEventsAfter(cursor);

      for (const event of events) {
        send(client, { type: "request-event", event: { ...event, replayed: true } });
        cursor = event.eventId;
      }

      if (events.length < batchSize) {
        break;
      }
    }
  }

  client.lastDeliveredEventId = cursor;
  client.ready = true;

  for (const event of [...client.buffered.values()].sort((left, right) =>
    BigInt(left.eventId) < BigInt(right.eventId) ? -1 : 1)) {
    deliver(client, event);
  }
  client.buffered.clear();
  send(client, { type: "ready", cursor: client.lastDeliveredEventId });
}

async function reconcile() {
  if (!clients.size || shuttingDown) {
    return;
  }

  try {
    let cursor = [...clients].reduce(
      (lowest, client) =>
        BigInt(client.lastDeliveredEventId) < BigInt(lowest)
          ? client.lastDeliveredEventId
          : lowest,
      [...clients][0].lastDeliveredEventId,
    );

    while (!shuttingDown) {
      const events = await getEventsAfter(cursor);

      for (const event of events) {
        fanOut(event, true);
        cursor = event.eventId;
      }

      if (events.length < batchSize) {
        break;
      }
    }
  } catch (error) {
    databaseHealthy = false;
    console.error("[realtime] Outbox reconciliation failed", error.message);
  }
}

async function connectListener() {
  if (shuttingDown) {
    return;
  }

  try {
    const client = new Client({ connectionString: databaseUrl, ssl });
    listenClient = client;
    await client.connect();
    await client.query(`listen ${eventChannel}`);
    listenHealthy = true;
    databaseHealthy = true;
    listenReconnectDelayMs = 500;

    client.on("notification", async (notification) => {
      try {
        const event = parseEvent(notification.payload);
        if (event) {
          await publishEvent(event);
        }
      } catch (error) {
        console.error("[realtime] Invalid LISTEN payload", error.message);
      }
    });
    const reconnect = () => {
      if (listenClient !== client) return;
      listenHealthy = false;
      listenClient = null;
      scheduleListenerReconnect();
    };
    client.on("error", reconnect);
    client.on("end", reconnect);
  } catch (error) {
    listenHealthy = false;
    console.error("[realtime] LISTEN connection failed", error.message);
    scheduleListenerReconnect();
  }
}

function scheduleListenerReconnect() {
  if (shuttingDown || listenReconnectTimer) return;
  listenReconnectTimer = setTimeout(() => {
    listenReconnectTimer = null;
    void connectListener();
  }, listenReconnectDelayMs);
  listenReconnectDelayMs = Math.min(listenReconnectDelayMs * 2, 10_000);
}

redisSubscriber.on("ready", () => { redisHealthy = true; });
redisSubscriber.on("error", (error) => {
  redisHealthy = false;
  console.error("[realtime] Redis subscriber error", error.message);
});
redisSubscriber.on("message", (channel, payload) => {
  if (channel !== redisChannel) return;
  try {
    const event = parseEvent(payload);
    if (event) fanOut(event);
  } catch (error) {
    console.error("[realtime] Invalid Redis payload", error.message);
  }
});
await redisSubscriber.subscribe(redisChannel);
await connectListener();

const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    const healthy = databaseHealthy && listenHealthy && redisHealthy;
    json(response, healthy ? 200 : 503, {
      status: healthy ? "ok" : "degraded",
      database: databaseHealthy,
      listen: listenHealthy,
      redis: redisHealthy,
      connections: clients.size,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/internal/events") {
    if (request.headers.authorization !== `Bearer ${pushSecret}`) {
      json(response, 401, { message: "unauthorized" });
      return;
    }

    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 16_384) break;
    }

    try {
      const eventId = normalizeEventId(JSON.parse(body).eventId);
      const event = eventId ? await getEvent(eventId) : null;

      if (!event) {
        json(response, 404, { message: "event not found" });
        return;
      }

      await publishEvent(event);
      json(response, 202, { accepted: true, eventId });
    } catch (error) {
      json(response, 400, { message: error.message });
    }
    return;
  }

  json(response, 404, { message: "not found" });
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const protocols = String(request.headers["sec-websocket-protocol"] ?? "")
    .split(",")
    .map((value) => value.trim());
  const ticketProtocol = protocols.find((value) => value.startsWith("ticket."));
  const ticket = ticketProtocol ? verifyTicket(ticketProtocol.slice(7)) : null;

  if (url.pathname !== "/ws" || !ticket) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, request, ticket, url);
  });
});

webSocketServer.on("connection", (socket, _request, ticket, url) => {
  const client = {
    socket,
    connectionId: ticket.connectionId,
    lastDeliveredEventId: normalizeEventId(url.searchParams.get("cursor")) ?? "0",
    lastAckEventId: null,
    ready: false,
    buffered: new Map(),
    alive: true,
  };
  clients.add(client);

  socket.on("pong", () => { client.alive = true; });
  socket.on("message", (data) => {
    try {
      const message = JSON.parse(String(data));
      const eventId = normalizeEventId(message.eventId);
      if (message.type === "ack" && eventId) client.lastAckEventId = eventId;
    } catch {
      // Invalid client messages do not affect the durable server cursor.
    }
  });
  socket.on("close", () => clients.delete(client));
  socket.on("error", () => clients.delete(client));

  void replayClient(client, normalizeEventId(url.searchParams.get("cursor"))).catch((error) => {
    console.error("[realtime] Client replay failed", error.message);
    socket.close(1011, "replay failed");
  });
});

const heartbeatTimer = setInterval(() => {
  for (const client of clients) {
    if (!client.alive) {
      client.socket.terminate();
      clients.delete(client);
      continue;
    }
    client.alive = false;
    client.socket.ping();
  }
}, heartbeatIntervalMs);
const reconciliationTimer = setInterval(() => void reconcile(), reconciliationIntervalMs);
const retentionTimer = setInterval(() => {
  void pool.query(
    `delete from admin_request_event_log
      where created_at < now() - ($1::text || ' days')::interval`,
    [String(outboxRetentionDays)],
  ).catch((error) => console.error("[realtime] Outbox retention cleanup failed", error.message));
}, 24 * 60 * 60_000);

server.listen(port, "0.0.0.0", () => {
  console.info(`[realtime] listening on :${port}`);
});

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(heartbeatTimer);
  clearInterval(reconciliationTimer);
  clearInterval(retentionTimer);
  if (listenReconnectTimer) clearTimeout(listenReconnectTimer);
  for (const client of clients) client.socket.close(1012, "server restart");
  server.close();
  await Promise.allSettled([
    listenClient?.end(),
    redisSubscriber.quit(),
    redisPublisher.quit(),
    pool.end(),
  ]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

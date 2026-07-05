import {
  experimental_upgradeWebSocket,
  type WebSocket,
} from "@vercel/functions";
import {
  ensureAdminRequestEventsSchema,
  getAdminRequestEventsAfter,
  getLatestAdminRequestEventId,
  parseAdminRequestEvent,
  type AdminRequestEvent,
} from "@/lib/admin-request-events";
import {
  adminRequestEventsRedisStream,
  createAdminRequestEventsRedis,
  hasAdminRequestEventsRedis,
} from "@/lib/admin-request-events-redis";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { canUserAccessChargeRequest } from "@/lib/charge-requests-repository";
import { hasDatabaseUrl } from "@/lib/db";
import { canUserAccessDistributorWithdrawal } from "@/lib/distributor-withdrawals-repository";
import { canUserAccessDomainExchange } from "@/lib/domain-exchanges-repository";
import { isReducedNotificationPollingPilot } from "@/lib/realtime-sync-pilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const replayPageSize = 500;
const heartbeatIntervalMs = 20000;

function normalizeEventId(value: string | null) {
  const normalized = value?.trim() ?? "";
  return /^\d+$/.test(normalized) ? normalized : null;
}

function isSameOrigin(requestUrl: URL, origin: string | null) {
  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === requestUrl.origin;
  } catch {
    return false;
  }
}

async function canUserAccessEvent(user: SessionUser, event: AdminRequestEvent) {
  if (user.role === "MASTER") {
    return true;
  }

  if (event.kind === "charge") {
    return canUserAccessChargeRequest(user, event.requestId);
  }

  if (event.kind === "domain_exchange") {
    return canUserAccessDomainExchange(user, event.requestId);
  }

  return canUserAccessDistributorWithdrawal(user, event.requestId);
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requestOrigin = request.headers.get("origin");

  if (!isSameOrigin(requestUrl, requestOrigin)) {
    return Response.json(
      { message: "허용되지 않은 웹소켓 연결입니다." },
      { status: 403 },
    );
  }

  const user = await getSessionUser();

  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!isReducedNotificationPollingPilot(user)) {
    return Response.json(
      { message: "웹소켓 테스트 대상 계정이 아닙니다." },
      { status: 403 },
    );
  }

  if (!hasDatabaseUrl()) {
    return Response.json(
      { message: "DB 연결 환경에서만 실시간 이벤트를 사용할 수 있습니다." },
      { status: 400 },
    );
  }

  if (!hasAdminRequestEventsRedis()) {
    return Response.json(
      { message: "Redis 연결 환경에서만 웹소켓을 사용할 수 있습니다." },
      { status: 503 },
    );
  }

  await ensureAdminRequestEventsSchema();

  const reconnectCursor = normalizeEventId(requestUrl.searchParams.get("cursor"));

  return experimental_upgradeWebSocket(async (ws) => {
    const redis = createAdminRequestEventsRedis({ blocking: true });
    let heartbeatId: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    let replaying = true;
    let bufferedEvents: Array<AdminRequestEvent & { eventId?: string }> = [];
    let deliveryQueue = Promise.resolve();
    let lastDeliveredEventId = reconnectCursor;
    let resolveSocketClosed: (() => void) | null = null;
    const socketClosed = new Promise<void>((resolve) => {
      resolveSocketClosed = resolve;
    });

    const enqueueEvent = (
      event: AdminRequestEvent & { eventId?: string },
      replayed = false,
    ) => {
      deliveryQueue = deliveryQueue
        .then(async () => {
          if (
            event.eventId &&
            lastDeliveredEventId &&
            BigInt(event.eventId) <= BigInt(lastDeliveredEventId)
          ) {
            return;
          }

          if (await canUserAccessEvent(user, event)) {
            sendJson(ws, { type: "request-event", event: { ...event, replayed } });
          }

          if (event.eventId) {
            lastDeliveredEventId = event.eventId;
          }
        })
        .catch(() => undefined);
    };

    const close = () => {
      if (closed) {
        return;
      }

      closed = true;
      resolveSocketClosed?.();
      resolveSocketClosed = null;

      if (heartbeatId) {
        clearInterval(heartbeatId);
        heartbeatId = null;
      }

      redis.disconnect();
    };

    ws.on("close", close);
    ws.on("error", close);
    ws.on("message", (data) => {
      if (data.toString() === "ping") {
        sendJson(ws, { type: "pong" });
      }
    });

    try {
      await redis.connect();
      console.info("[request-socket] Redis connected", {
        loginId: user.loginId,
      });

      void (async () => {
        let redisCursor = "$";

        while (!closed) {
          const streams = await redis.xread(
            "BLOCK",
            0,
            "STREAMS",
            adminRequestEventsRedisStream,
            redisCursor,
          );

          for (const [, entries] of streams ?? []) {
            for (const [streamId, fields] of entries) {
              redisCursor = streamId;
              const eventIndex = fields.indexOf("event");
              const event = parseAdminRequestEvent(
                eventIndex >= 0 ? fields[eventIndex + 1] : undefined,
              );

              if (event) {
                if (replaying) {
                  bufferedEvents.push(event);
                } else {
                  enqueueEvent(event);
                }
              }
            }
          }
        }
      })().catch(() => {
        if (!closed) {
          console.error("[request-socket] Redis read failed", {
            loginId: user.loginId,
          });
          sendJson(ws, { type: "error", message: "Redis 실시간 연결이 끊겼습니다." });
          ws.close(1011, "redis realtime connection failed");
        }
      });

      if (reconnectCursor) {
        let cursor = reconnectCursor;

        while (!closed) {
          const missedEvents = await getAdminRequestEventsAfter(cursor);

          for (const event of missedEvents) {
            enqueueEvent(event, true);
            cursor = event.eventId;
          }

          if (missedEvents.length < replayPageSize) {
            break;
          }
        }
      } else {
        lastDeliveredEventId = await getLatestAdminRequestEventId();
      }

      const eventsReceivedDuringReplay = bufferedEvents.sort((left, right) => {
        if (!left.eventId || !right.eventId) {
          return 0;
        }

        return BigInt(left.eventId) === BigInt(right.eventId)
          ? 0
          : BigInt(left.eventId) < BigInt(right.eventId)
            ? -1
            : 1;
      });
      bufferedEvents = [];
      replaying = false;

      for (const event of eventsReceivedDuringReplay) {
        enqueueEvent(event);
      }

      await deliveryQueue;
      sendJson(ws, {
        type: "ready",
        cursor: lastDeliveredEventId,
        replayed: Boolean(reconnectCursor),
      });

      heartbeatId = setInterval(() => {
        if (ws.readyState === 1) {
          ws.ping();
        }
      }, heartbeatIntervalMs);

      await socketClosed;
    } catch (error) {
      console.error("[request-socket] Connection failed", {
        loginId: user.loginId,
        message: error instanceof Error ? error.message : "unknown error",
      });
      sendJson(ws, { type: "error", message: "실시간 연결에 실패했습니다." });
      ws.close(1011, "realtime connection failed");
      close();
    }
  }, { maxPayload: 16 * 1024 });
}

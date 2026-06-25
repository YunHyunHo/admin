import { NextResponse } from "next/server";
import type { Notification } from "pg";

import { getPgPool, hasDatabaseUrl, query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const domainExchangeEventsChannel = "domain_exchange_events";
const heartbeatIntervalMs = 10000;
const pollIntervalMs = 3000;
const maxReplayMs = 24 * 60 * 60 * 1000;
const liveCursorSkewMs = 30000;

type DomainLookupRow = {
  id: string;
};

type RequestEventRow = {
  id: string;
  domainId: string;
  amount: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELED";
  updatedAt: string;
  updatedMs: number;
};

type DomainBalanceRow = {
  domainId: string;
  updatedAt: string;
  updatedMs: number;
};

type ApprovedExchangeNotification = {
  id: string;
  domainId: string;
  amount: number;
  status: "APPROVED";
  approvedAt: string;
};

function isUuid(value: string | null | undefined) {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  );
}

function sseHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
    "X-Accel-Buffering": "no",
  };
}

function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function statusEventName(
  kind: "charge-request" | "domain-exchange",
  status: RequestEventRow["status"],
) {
  if (status === "PENDING") {
    return `${kind}-created`;
  }

  if (status === "APPROVED" || status === "COMPLETED") {
    return `${kind}-approved`;
  }

  return `${kind}-rejected`;
}

function parseApprovedExchangeNotification(payload: string | undefined) {
  if (!payload) {
    return null;
  }

  try {
    const event = JSON.parse(payload) as Partial<ApprovedExchangeNotification>;

    if (
      typeof event.id === "string" &&
      typeof event.domainId === "string" &&
      typeof event.amount === "number" &&
      event.status === "APPROVED" &&
      typeof event.approvedAt === "string"
    ) {
      return event as ApprovedExchangeNotification;
    }
  } catch {
    return null;
  }

  return null;
}

async function resolveDomainId(request: Request) {
  const { searchParams } = new URL(request.url);
  const domainId = searchParams.get("domainId")?.trim() ?? "";
  const domainName = searchParams.get("domainName")?.trim() ?? "";

  if (domainId && !isUuid(domainId)) {
    throw new Error("도메인 ID 형식을 확인해주세요.");
  }

  if (!domainId && !domainName) {
    throw new Error("연동 도메인 정보를 확인해주세요.");
  }

  const result = await query<DomainLookupRow>(
    `
      select dom.id::text as id
      from domains dom
      join companies c on c.id = dom.company_id
      where dom.status <> 'DELETED'
        and (
          ($1::uuid is not null and dom.id = $1::uuid)
          or (
            $1::uuid is null
            and $2::text <> ''
            and (dom.domain_name = $2 or c.company_name = $2)
          )
        )
      limit 1
    `,
    [domainId || null, domainName],
  );
  const resolved = result.rows[0]?.id;

  if (!resolved) {
    throw new Error("도메인 정보를 찾을 수 없습니다.");
  }

  return resolved;
}

function getReplaySince(request: Request) {
  const sinceParam = new URL(request.url).searchParams.get("since");
  const requestedSince = sinceParam ? Number(sinceParam) : Number.NaN;
  const oldestReplayTime = Date.now() - maxReplayMs;

  return Number.isFinite(requestedSince)
    ? Math.max(requestedSince, oldestReplayTime)
    : Date.now() - liveCursorSkewMs;
}

export async function GET(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { ok: false, message: "DB 연결 환경에서만 이벤트 API를 사용할 수 있습니다." },
      { status: 400, headers: sseHeaders() },
    );
  }

  let domainId: string;

  try {
    domainId = await resolveDomainId(request);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "도메인 이벤트 연결 중 오류가 발생했습니다.",
      },
      { status: 400, headers: sseHeaders() },
    );
  }

  const client = await getPgPool().connect();

  try {
    await client.query(`listen ${domainExchangeEventsChannel}`);
  } catch (error) {
    client.release();

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "도메인 이벤트 수신 준비 중 오류가 발생했습니다.",
      },
      { status: 500, headers: sseHeaders() },
    );
  }

  const encoder = new TextEncoder();
  let heartbeatId: ReturnType<typeof setInterval> | null = null;
  let pollId: ReturnType<typeof setInterval> | null = null;
  let isClosed = false;
  let isPolling = false;
  let cursorMs = getReplaySince(request);
  let notificationHandler: ((notification: Notification) => void) | null = null;
  const emittedEvents = new Set<string>();

  const close = () => {
    if (isClosed) {
      return;
    }

    isClosed = true;

    if (heartbeatId) {
      clearInterval(heartbeatId);
      heartbeatId = null;
    }

    if (pollId) {
      clearInterval(pollId);
      pollId = null;
    }

    if (notificationHandler) {
      client.off("notification", notificationHandler);
      notificationHandler = null;
    }

    void client.query(`unlisten ${domainExchangeEventsChannel}`).finally(() => {
      client.release();
    });
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown, dedupeKey?: string) => {
        if (isClosed) {
          return;
        }

        if (dedupeKey) {
          if (emittedEvents.has(dedupeKey)) {
            return;
          }

          emittedEvents.add(dedupeKey);
        }

        controller.enqueue(encoder.encode(encodeSse(event, data)));
      };

      const sendBalanceUpdated = (updatedAt: string, dedupeKey: string) => {
        send(
          "domain-balance-updated",
          { domainId, updatedAt },
          `domain-balance-updated:${dedupeKey}`,
        );
      };

      const emitRequestEvent = (
        kind: "charge-request" | "domain-exchange",
        row: RequestEventRow,
      ) => {
        const event = statusEventName(kind, row.status);
        const dedupeKey = `${event}:${row.id}:${row.status}`;

        send(
          event,
          {
            id: row.id,
            domainId: row.domainId,
            amount: row.amount,
            status: row.status,
            updatedAt: row.updatedAt,
          },
          dedupeKey,
        );

        if (row.status !== "PENDING") {
          sendBalanceUpdated(row.updatedAt, `${kind}:${row.id}:${row.status}`);
        }
      };

      const pollChanges = async () => {
        if (isClosed || isPolling) {
          return;
        }

        isPolling = true;

        try {
          const chargeResult = await client.query<RequestEventRow>(
            `
              select
                id::text,
                domain_id::text as "domainId",
                amount::float8 as amount,
                status::text as status,
                to_char(updated_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') as "updatedAt",
                floor(extract(epoch from updated_at) * 1000)::float8 as "updatedMs"
              from charge_requests
              where domain_id = $1::uuid
                and updated_at >= to_timestamp($2::double precision / 1000.0)
              order by updated_at asc, created_at asc
              limit 100
            `,
            [domainId, cursorMs],
          );
          const exchangeResult = await client.query<RequestEventRow>(
            `
              select
                id::text,
                domain_id::text as "domainId",
                amount::float8 as amount,
                status::text as status,
                to_char(updated_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') as "updatedAt",
                floor(extract(epoch from updated_at) * 1000)::float8 as "updatedMs"
              from exchange_requests
              where domain_id = $1::uuid
                and updated_at >= to_timestamp($2::double precision / 1000.0)
              order by updated_at asc, created_at asc
              limit 100
            `,
            [domainId, cursorMs],
          );
          const domainResult = await client.query<DomainBalanceRow>(
            `
              select
                id::text as "domainId",
                to_char(updated_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') as "updatedAt",
                floor(extract(epoch from updated_at) * 1000)::float8 as "updatedMs"
              from domains
              where id = $1::uuid
                and updated_at >= to_timestamp($2::double precision / 1000.0)
              limit 1
            `,
            [domainId, cursorMs],
          );
          let nextCursorMs = cursorMs;

          chargeResult.rows.forEach((row) => {
            emitRequestEvent("charge-request", row);
            nextCursorMs = Math.max(nextCursorMs, row.updatedMs + 1);
          });

          exchangeResult.rows.forEach((row) => {
            emitRequestEvent("domain-exchange", row);
            nextCursorMs = Math.max(nextCursorMs, row.updatedMs + 1);
          });

          domainResult.rows.forEach((row) => {
            sendBalanceUpdated(row.updatedAt, `domain:${row.updatedMs}`);
            nextCursorMs = Math.max(nextCursorMs, row.updatedMs + 1);
          });

          cursorMs = nextCursorMs;
        } catch {
          // Keep the SSE connection alive; the next poll can recover.
        } finally {
          isPolling = false;
        }
      };

      const keepAlive = () => {
        if (!isClosed) {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        }
      };

      const handleNotification = (notification: Notification) => {
        if (notification.channel !== domainExchangeEventsChannel) {
          return;
        }

        const approvedEvent = parseApprovedExchangeNotification(
          notification.payload,
        );

        if (!approvedEvent || approvedEvent.domainId !== domainId) {
          return;
        }

        send(
          "domain-exchange-approved",
          approvedEvent,
          `domain-exchange-approved:${approvedEvent.id}:APPROVED`,
        );
        sendBalanceUpdated(
          approvedEvent.approvedAt,
          `domain-exchange:${approvedEvent.id}:APPROVED`,
        );
      };

      notificationHandler = handleNotification;
      client.on("notification", handleNotification);
      request.signal.addEventListener("abort", close, { once: true });

      controller.enqueue(encoder.encode("retry: 3000\n: connected\n\n"));
      heartbeatId = setInterval(keepAlive, heartbeatIntervalMs);
      pollId = setInterval(() => {
        void pollChanges();
      }, pollIntervalMs);
      void pollChanges();
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...sseHeaders(),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

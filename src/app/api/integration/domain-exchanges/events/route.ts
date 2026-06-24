import { NextResponse } from "next/server";
import type { Notification } from "pg";

import { getPgPool, hasDatabaseUrl, query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const domainExchangeEventsChannel = "domain_exchange_events";
const heartbeatIntervalMs = 10000;

type DomainLookupRow = {
  id: string;
};

type DomainExchangeApprovedEvent = {
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
      select id::text as id
      from domains
      where status <> 'DELETED'
        and (
          ($1::uuid is not null and id = $1::uuid)
          or ($2::text <> '' and domain_name = $2)
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

function parseApprovedEvent(payload: string | undefined) {
  if (!payload) {
    return null;
  }

  try {
    const event = JSON.parse(payload) as Partial<DomainExchangeApprovedEvent>;

    if (
      typeof event.id === "string" &&
      typeof event.domainId === "string" &&
      typeof event.amount === "number" &&
      event.status === "APPROVED" &&
      typeof event.approvedAt === "string"
    ) {
      return event as DomainExchangeApprovedEvent;
    }
  } catch {
    return null;
  }

  return null;
}

function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
  let isClosed = false;
  let notificationHandler: ((notification: Notification) => void) | null = null;

  const close = () => {
    if (isClosed) {
      return;
    }

    isClosed = true;

    if (heartbeatId) {
      clearInterval(heartbeatId);
      heartbeatId = null;
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
      const send = (event: string, data: unknown) => {
        if (isClosed) {
          return;
        }

        controller.enqueue(encoder.encode(encodeSse(event, data)));
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

        const approvedEvent = parseApprovedEvent(notification.payload);

        if (!approvedEvent || approvedEvent.domainId !== domainId) {
          return;
        }

        send("domain-exchange-approved", approvedEvent);
      };

      notificationHandler = handleNotification;
      client.on("notification", handleNotification);
      request.signal.addEventListener(
        "abort",
        () => {
          close();
        },
        { once: true },
      );

      controller.enqueue(encoder.encode("retry: 3000\n: connected\n\n"));
      heartbeatId = setInterval(keepAlive, heartbeatIntervalMs);
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

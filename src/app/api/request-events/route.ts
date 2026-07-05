import { NextResponse } from "next/server";
import type { Notification } from "pg";

import { getSessionUser } from "@/lib/auth";
import {
  adminRequestEventsChannel,
  parseAdminRequestEvent,
  type AdminRequestEvent,
} from "@/lib/admin-request-events";
import { canUserAccessChargeRequest } from "@/lib/charge-requests-repository";
import { getPgPool, hasDatabaseUrl } from "@/lib/db";
import { canUserAccessDistributorWithdrawal } from "@/lib/distributor-withdrawals-repository";
import { canUserAccessDomainExchange } from "@/lib/domain-exchanges-repository";
import { isPerformancePilotUser } from "@/lib/performance-pilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const heartbeatIntervalMs = 10000;

function sseHeaders() {
  return {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
    "X-Accel-Buffering": "no",
  };
}

function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function canUserAccessEvent(user: Awaited<ReturnType<typeof getSessionUser>>, event: AdminRequestEvent) {
  if (!user) {
    return false;
  }

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

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!isPerformancePilotUser(user)) {
    return NextResponse.json({ message: "실시간 테스트 계정만 사용할 수 있습니다." }, { status: 403 });
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { message: "DB 연결 환경에서만 실시간 이벤트를 사용할 수 있습니다." },
      { status: 400 },
    );
  }

  const client = await getPgPool().connect();

  try {
    await client.query(`listen ${adminRequestEventsChannel}`);
  } catch (error) {
    client.release();

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "실시간 이벤트 수신 준비 중 오류가 발생했습니다.",
      },
      { status: 500 },
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

    void client.query(`unlisten ${adminRequestEventsChannel}`).finally(() => {
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
        if (notification.channel !== adminRequestEventsChannel) {
          return;
        }

        const event = parseAdminRequestEvent(notification.payload);

        if (!event) {
          return;
        }

        void canUserAccessEvent(user, event).then((canAccess) => {
          if (canAccess) {
            send("request-event", event);
          }
        });
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

      controller.enqueue(encoder.encode("retry: 3000\n"));
      send("ready", { ok: true });
      heartbeatId = setInterval(keepAlive, heartbeatIntervalMs);
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

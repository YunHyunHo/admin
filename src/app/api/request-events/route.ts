import { NextResponse } from "next/server";
import type { Notification } from "pg";

import { getSessionUser } from "@/lib/auth";
import {
  adminRequestEventsChannel,
  ensureAdminRequestEventsSchema,
  getAdminRequestEventsAfter,
  getLatestAdminRequestEventId,
  parseAdminRequestEvent,
  type AdminRequestEvent,
  type StoredAdminRequestEvent,
} from "@/lib/admin-request-events";
import { canUserAccessChargeRequest } from "@/lib/charge-requests-repository";
import { getPgPool, hasDatabaseUrl } from "@/lib/db";
import { canUserAccessDistributorWithdrawal } from "@/lib/distributor-withdrawals-repository";
import { canUserAccessDomainExchange } from "@/lib/domain-exchanges-repository";
import { isReducedNotificationPollingPilot } from "@/lib/realtime-sync-pilot";

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

function encodeSse(event: string, data: unknown, id?: string) {
  return `${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function normalizeEventId(value: string | null) {
  const normalized = value?.trim() ?? "";
  return /^\d+$/.test(normalized) ? normalized : null;
}

async function canUserAccessEvent(user: Awaited<ReturnType<typeof getSessionUser>>, event: AdminRequestEvent) {
  if (!user) {
    return false;
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

  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { message: "DB 연결 환경에서만 실시간 이벤트를 사용할 수 있습니다." },
      { status: 400 },
    );
  }

  await ensureAdminRequestEventsSchema();

  const replayEnabled = isReducedNotificationPollingPilot(user);
  const reconnectCursor = replayEnabled
    ? normalizeEventId(request.headers.get("last-event-id"))
    : null;

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
      const send = (event: string, data: unknown, id?: string) => {
        if (isClosed) {
          return;
        }

        controller.enqueue(encoder.encode(encodeSse(event, data, id)));
      };

      const keepAlive = () => {
        if (!isClosed) {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        }
      };

      let isReplaying = replayEnabled;
      let deliveryQueue = Promise.resolve();
      let queuedNotifications: StoredAdminRequestEvent[] = [];
      let lastDeliveredEventId = reconnectCursor;

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
              send("request-event", { ...event, replayed }, event.eventId);
            }

            if (event.eventId) {
              lastDeliveredEventId = event.eventId;
            }
          })
          .catch(() => undefined);
      };

      const handleNotification = (notification: Notification) => {
        if (notification.channel !== adminRequestEventsChannel) {
          return;
        }

        const event = parseAdminRequestEvent(notification.payload);

        if (!event) {
          return;
        }

        if (isReplaying && event.eventId) {
          queuedNotifications.push(event as StoredAdminRequestEvent);
          return;
        }

        enqueueEvent(event);
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
      heartbeatId = setInterval(keepAlive, heartbeatIntervalMs);

      void (async () => {
        try {
          if (reconnectCursor) {
            let cursor = reconnectCursor;

            while (!isClosed) {
              const missedEvents = await getAdminRequestEventsAfter(cursor);

              for (const event of missedEvents) {
                enqueueEvent(event, true);
                cursor = event.eventId;
              }

              if (missedEvents.length < 500) {
                break;
              }
            }
          } else if (replayEnabled) {
            lastDeliveredEventId = await getLatestAdminRequestEventId();
          }
        } catch {
          send("replay-error", { message: "누락 이벤트 복구에 실패했습니다." });
        } finally {
          const bufferedEvents = queuedNotifications.sort((left, right) =>
            BigInt(left.eventId) === BigInt(right.eventId)
              ? 0
              : BigInt(left.eventId) < BigInt(right.eventId)
                ? -1
                : 1,
          );
          queuedNotifications = [];
          isReplaying = false;

          for (const event of bufferedEvents) {
            enqueueEvent(event);
          }

          await deliveryQueue;
          send("ready", {
            ok: true,
            replayed: Boolean(reconnectCursor),
            cursor: lastDeliveredEventId,
          }, lastDeliveredEventId ?? undefined);
        }
      })();
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

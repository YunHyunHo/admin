import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { Notification } from "pg";

import { getSessionUser, type SessionUser } from "@/lib/auth";
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
import {
  isReducedNotificationPollingPilot,
  isMapleImmediateRealtimePilot,
  isMapleSseNoPollingPilot,
  isReliableRequestEventRecoveryEnabled,
} from "@/lib/realtime-sync-pilot";
import {
  adminRequestEventsRedisStream,
  createAdminRequestEventsRedis,
  hasAdminRequestEventsRedis,
} from "@/lib/admin-request-events-redis";
import {
  getAdminRequestUsageIdentity,
  recordRequestUsage,
} from "@/lib/request-usage-metrics";

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

async function createMapleRedisEventStream(
  request: Request,
  user: SessionUser,
) {
  const redis = createAdminRequestEventsRedis({ blocking: true });

  try {
    await redis.connect();
  } catch {
    redis.disconnect();
    return null;
  }

  const reconnectCursor = normalizeEventId(
    request.headers.get("last-event-id"),
  );
  const latestRedisEntries = await redis.xrevrange(
    adminRequestEventsRedisStream,
    "+",
    "-",
    "COUNT",
    1,
  );
  const initialRedisCursor = latestRedisEntries[0]?.[0] ?? "$";
  const initialEventCursor = reconnectCursor ?? await getLatestAdminRequestEventId();
  const encoder = new TextEncoder();
  let isClosed = false;

  const close = () => {
    if (isClosed) {
      return;
    }

    isClosed = true;
    redis.disconnect();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown, id?: string) => {
        if (!isClosed) {
          controller.enqueue(encoder.encode(encodeSse(event, data, id)));
        }
      };
      let lastDeliveredEventId = initialEventCursor;

      const deliver = async (
        event: StoredAdminRequestEvent,
        replayed = false,
      ) => {
        if (
          lastDeliveredEventId &&
          BigInt(event.eventId) <= BigInt(lastDeliveredEventId)
        ) {
          return;
        }

        if (await canUserAccessEvent(user, event)) {
          send("request-event", { ...event, replayed }, event.eventId);
        }

        lastDeliveredEventId = event.eventId;
      };

      request.signal.addEventListener("abort", close, { once: true });
      controller.enqueue(encoder.encode("retry: 3000\n"));

      void (async () => {
        try {
          if (reconnectCursor) {
            let cursor = reconnectCursor;

            while (!isClosed) {
              const missedEvents = await getAdminRequestEventsAfter(cursor);

              for (const event of missedEvents) {
                await deliver(event, true);
                cursor = event.eventId;
              }

              if (missedEvents.length < 500) {
                break;
              }
            }
          }

          send(
            "ready",
            {
              ok: true,
              source: "redis",
              replayed: Boolean(reconnectCursor),
              cursor: lastDeliveredEventId,
            },
            lastDeliveredEventId,
          );

          let redisCursor = initialRedisCursor;

          while (!isClosed) {
            const streams = await redis.xread(
              "BLOCK",
              10000,
              "STREAMS",
              adminRequestEventsRedisStream,
              redisCursor,
            );

            if (!streams) {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
              continue;
            }

            for (const [, entries] of streams) {
              for (const [streamId, fields] of entries) {
                redisCursor = streamId;
                const eventIndex = fields.indexOf("event");
                const event = parseAdminRequestEvent(
                  eventIndex >= 0 ? fields[eventIndex + 1] : undefined,
                );

                if (event?.eventId) {
                  await deliver(event as StoredAdminRequestEvent);
                }
              }
            }
          }
        } catch {
          if (!isClosed) {
            send("replay-error", {
              message: "Maple 실시간 이벤트 연결이 끊겼습니다.",
            });
            close();
          }
        }
      })();
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  recordRequestUsage({
    request,
    identity: getAdminRequestUsageIdentity(user),
  });

  const maplePreviewDebug =
    isMapleSseNoPollingPilot(user) && process.env.VERCEL_ENV === "preview";
  const connectionId = maplePreviewDebug ? randomUUID() : null;
  const debugLog = (stage: string, detail: Record<string, unknown> = {}) => {
    if (!maplePreviewDebug) {
      return;
    }

    console.info("[maple-sse-debug]", {
      stage,
      connectionId,
      loginId: user.loginId,
      role: user.role,
      ...detail,
    });
  };

  debugLog("connection-authenticated", {
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    hasCookie: Boolean(request.headers.get("cookie")),
  });

  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { message: "DB 연결 환경에서만 실시간 이벤트를 사용할 수 있습니다." },
      { status: 400 },
    );
  }

  await ensureAdminRequestEventsSchema();

  if (
    isMapleImmediateRealtimePilot(user) &&
    !isMapleSseNoPollingPilot(user) &&
    hasAdminRequestEventsRedis()
  ) {
    const mapleStream = await createMapleRedisEventStream(request, user);

    if (mapleStream) {
      return mapleStream;
    }
  }

  const replayEnabled =
    isReducedNotificationPollingPilot(user) ||
    isReliableRequestEventRecoveryEnabled(user);
  const reconnectCursor = replayEnabled
    ? normalizeEventId(request.headers.get("last-event-id"))
    : null;

  const client = await getPgPool().connect();

  try {
    await client.query(`listen ${adminRequestEventsChannel}`);
    debugLog("listen-ready", { channel: adminRequestEventsChannel });
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
    debugLog("connection-close");

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

            const canAccess = await canUserAccessEvent(user, event);
            debugLog("permission-checked", {
              eventId: event.eventId,
              kind: event.kind,
              requestId: event.requestId,
              canAccess,
              replayed,
            });

            if (canAccess) {
              debugLog("event-write-start", {
                eventId: event.eventId,
                kind: event.kind,
                requestId: event.requestId,
              });
              send("request-event", { ...event, replayed }, event.eventId);
              debugLog("event-write-complete", {
                eventId: event.eventId,
                kind: event.kind,
                requestId: event.requestId,
              });
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
          debugLog("notification-invalid");
          return;
        }

        debugLog("notification-received", {
          eventId: event.eventId,
          kind: event.kind,
          requestId: event.requestId,
        });

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
          debugLog("ready-write-complete", {
            cursor: lastDeliveredEventId,
            replayed: Boolean(reconnectCursor),
          });
        }
      })();
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

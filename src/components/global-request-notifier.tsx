"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationVolumeControl } from "@/components/notification-volume-control";
import { useNotificationSoundVolume } from "@/lib/notification-sound-volume";

const noticeSoundPath = "/sounds/notice.mp3";
const defaultPollIntervalMs = 1000;
const noticeSoundReadyKey = "winpay-notice-sound-ready";
const pendingNoticeSnapshotKey = "winpay-pending-notice-snapshot";
const noticeRetryDelayMs = 1200;
const maxNoticePlayAttempts = 3;
const maxListSyncWaitMs = 2500;

let reliableNoticeAudio: HTMLAudioElement | null = null;
let reliableNoticeSoundReady = false;

export type RequestNotificationSnapshot = {
  pendingIds: {
    charges: string[];
    domainExchanges: string[];
    distributorWithdrawals: string[];
  };
};

export type PendingRequestCounts = {
  charges: number;
  domainExchanges: number;
  distributorWithdrawals: number;
};

export type RequestNotificationSyncDetail = RequestNotificationSnapshot & {
  counts: PendingRequestCounts;
  newPendingCount: number;
  waitUntil: (promise: Promise<unknown>) => void;
};

export const pendingRequestCountsEventName = "pending-request-counts";
export const requestNotificationSyncEventName = "request-notification-sync";
export const requestNotificationSnapshotEventName =
  "request-notification-snapshot";
export const requestNotifierRefreshEventName = "request-notifier-refresh";
export const requestRealtimeEventName = "request-realtime-event";
export const pendingRequestCountsStorageKey = "pending-request-counts-snapshot";

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    return null;
  }

  return (await response.json().catch(() => null)) as T | null;
}

function collectPendingSnapshot(data: RequestNotificationSnapshot) {
  const ids = new Set<string>();
  const counts: PendingRequestCounts = {
    charges: data.pendingIds.charges.length,
    domainExchanges: data.pendingIds.domainExchanges.length,
    distributorWithdrawals: data.pendingIds.distributorWithdrawals.length,
  };

  for (const id of data.pendingIds.charges) {
    ids.add(`charge:${id}`);
  }

  for (const id of data.pendingIds.domainExchanges) {
    ids.add(`domain-exchange:${id}`);
  }

  for (const id of data.pendingIds.distributorWithdrawals) {
    ids.add(`distributor-withdrawal:${id}`);
  }

  return { ids, counts };
}

function createPendingSnapshot(ids: Set<string>): RequestNotificationSnapshot {
  const snapshot: RequestNotificationSnapshot = {
    pendingIds: {
      charges: [],
      domainExchanges: [],
      distributorWithdrawals: [],
    },
  };

  for (const value of ids) {
    const separatorIndex = value.indexOf(":");
    const kind = value.slice(0, separatorIndex);
    const id = value.slice(separatorIndex + 1);

    if (!id) {
      continue;
    }

    if (kind === "charge") {
      snapshot.pendingIds.charges.push(id);
    } else if (kind === "domain-exchange") {
      snapshot.pendingIds.domainExchanges.push(id);
    } else if (kind === "distributor-withdrawal") {
      snapshot.pendingIds.distributorWithdrawals.push(id);
    }
  }

  return snapshot;
}

async function waitForListSync(promises: Promise<unknown>[]) {
  if (!promises.length) {
    return;
  }

  await Promise.race([
    Promise.allSettled(promises),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, maxListSyncWaitMs);
    }),
  ]);
}

type GlobalRequestNotifierProps = {
  realtimeEventsEnabled?: boolean;
  realtimeEventsPath?: string;
  eventDrivenSnapshotEnabled?: boolean;
  fallbackPollIntervalMs?: number;
  reliableNoticeSoundEnabled?: boolean;
  reliableRequestEventRecoveryEnabled?: boolean;
  noticeScopeKey?: string;
};

export function GlobalRequestNotifier({
  realtimeEventsEnabled = false,
  realtimeEventsPath = "/api/request-events",
  eventDrivenSnapshotEnabled = false,
  fallbackPollIntervalMs = defaultPollIntervalMs,
  reliableNoticeSoundEnabled = false,
  reliableRequestEventRecoveryEnabled = false,
  noticeScopeKey,
}: GlobalRequestNotifierProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { volume: notificationSoundVolume } = useNotificationSoundVolume();
  const notificationSoundVolumeRef = useRef(notificationSoundVolume);
  const knownPendingIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);
  const isSyncingRef = useRef(false);
  const retryTimeoutRef = useRef<number | null>(null);
  const lastRealtimeEventIdRef = useRef<string | null>(null);
  const [isSoundReady, setIsSoundReady] = useState(
    reliableNoticeSoundEnabled ? reliableNoticeSoundReady : true,
  );
  const [noticeMessage, setNoticeMessage] = useState(
    reliableNoticeSoundEnabled && !reliableNoticeSoundReady
      ? "알림음 켜기"
      : "알림 대기중",
  );

  const pendingSnapshotStorageKey = reliableNoticeSoundEnabled
    ? `${pendingNoticeSnapshotKey}:${noticeScopeKey ?? "default"}`
    : null;

  const ensureAudio = useCallback(() => {
    if (reliableNoticeSoundEnabled) {
      if (!reliableNoticeAudio) {
        reliableNoticeAudio = new Audio(noticeSoundPath);
        reliableNoticeAudio.preload = "auto";
      }

      reliableNoticeAudio.volume = notificationSoundVolumeRef.current;

      return reliableNoticeAudio;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio(noticeSoundPath);
      audioRef.current.preload = "auto";
    }

    audioRef.current.volume = notificationSoundVolumeRef.current;

    return audioRef.current;
  }, [reliableNoticeSoundEnabled]);

  useEffect(() => {
    notificationSoundVolumeRef.current = notificationSoundVolume;

    if (reliableNoticeAudio) {
      reliableNoticeAudio.volume = notificationSoundVolume;
    }

    if (audioRef.current) {
      audioRef.current.volume = notificationSoundVolume;
    }
  }, [notificationSoundVolume]);

  const persistKnownPendingIds = useCallback(
    (ids: Set<string>) => {
      if (!pendingSnapshotStorageKey) {
        return;
      }

      try {
        window.sessionStorage.setItem(
          pendingSnapshotStorageKey,
          JSON.stringify([...ids]),
        );
      } catch {
        // Session storage can be unavailable in restricted browser modes.
      }
    },
    [pendingSnapshotStorageKey],
  );

  const clearNoticeRetry = useCallback(() => {
    if (retryTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = null;
  }, []);

  const markNoticeReady = useCallback((message: string) => {
    if (reliableNoticeSoundEnabled) {
      reliableNoticeSoundReady = true;
    }

    setIsSoundReady(true);
    setNoticeMessage(message);

    try {
      window.localStorage.setItem(noticeSoundReadyKey, "1");
    } catch {
      // Local storage can be unavailable in restricted browser modes.
    }
  }, [reliableNoticeSoundEnabled]);

  const markNoticeBlocked = useCallback(() => {
    if (reliableNoticeSoundEnabled) {
      reliableNoticeSoundReady = false;
    }

    setIsSoundReady(false);
    setNoticeMessage("알림음 다시 켜기");
  }, [reliableNoticeSoundEnabled]);

  const playNoticeSound = useCallback(async () => {
    const audio = ensureAudio();
    audio.muted = false;
    audio.currentTime = 0;
    await audio.play();
    markNoticeReady("알림 대기중");
  }, [ensureAudio, markNoticeReady]);

  const playNoticeSoundWithRetry = useCallback(
    async () => {
      clearNoticeRetry();

      if (reliableNoticeSoundEnabled) {
        try {
          await playNoticeSound();
        } catch {
          markNoticeBlocked();
        }

        return;
      }

      for (let attempt = 1; attempt <= maxNoticePlayAttempts; attempt += 1) {
        try {
          await playNoticeSound();
          return;
        } catch {
          markNoticeBlocked();
        }

        if (attempt >= maxNoticePlayAttempts) {
          return;
        }

        await new Promise<void>((resolve) => {
          retryTimeoutRef.current = window.setTimeout(() => {
            retryTimeoutRef.current = null;
            resolve();
          }, noticeRetryDelayMs);
        });
      }
    },
    [
      clearNoticeRetry,
      markNoticeBlocked,
      playNoticeSound,
      reliableNoticeSoundEnabled,
    ],
  );

  const activateNoticeSound = useCallback(async () => {
    try {
      clearNoticeRetry();
      await playNoticeSound();
      markNoticeReady("알림음 켜짐");
    } catch {
      markNoticeBlocked();
    }
  }, [clearNoticeRetry, markNoticeBlocked, markNoticeReady, playNoticeSound]);

  const unlockNoticeSound = useCallback(async () => {
    try {
      const audio = ensureAudio();
      audio.muted = true;
      audio.currentTime = 0;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      markNoticeReady("알림 대기중");
    } catch {
      markNoticeBlocked();
    }
  }, [ensureAudio, markNoticeBlocked, markNoticeReady]);

  const syncRequests = useCallback(async () => {
    if (isSyncingRef.current) {
      return;
    }

    isSyncingRef.current = true;

    try {
      const data = await fetchJson<RequestNotificationSnapshot>(
        "/api/request-notifications",
      );

      // A temporary API failure must not erase the baseline and replay old alerts.
      if (!data?.pendingIds) {
        return;
      }

      const pendingSnapshot = collectPendingSnapshot(data);
      const nextPendingIds = pendingSnapshot.ids;
      const newPendingCount = [...nextPendingIds].filter(
        (id) => !knownPendingIdsRef.current.has(id),
      ).length;
      const listSyncPromises: Promise<unknown>[] = [];

      knownPendingIdsRef.current = nextPendingIds;
      persistKnownPendingIds(nextPendingIds);

      window.dispatchEvent(
        new CustomEvent<RequestNotificationSyncDetail>(
          requestNotificationSyncEventName,
          {
            detail: {
              ...data,
              counts: pendingSnapshot.counts,
              newPendingCount,
              waitUntil: (promise) => {
                listSyncPromises.push(Promise.resolve(promise).catch(() => undefined));
              },
            },
          },
        ),
      );

      await waitForListSync(listSyncPromises);

      try {
        window.sessionStorage.setItem(
          pendingRequestCountsStorageKey,
          JSON.stringify(pendingSnapshot.counts),
        );
      } catch {
        // Session storage can be unavailable in restricted browser modes.
      }

      window.dispatchEvent(
        new CustomEvent<PendingRequestCounts>(pendingRequestCountsEventName, {
          detail: pendingSnapshot.counts,
        }),
      );

      window.dispatchEvent(
        new CustomEvent<RequestNotificationSnapshot>(
          requestNotificationSnapshotEventName,
          { detail: data },
        ),
      );

      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        return;
      }

      if (newPendingCount > 0) {
        setNoticeMessage(`${newPendingCount}건 신규 신청`);
        void playNoticeSoundWithRetry();
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [persistKnownPendingIds, playNoticeSoundWithRetry]);

  useEffect(() => {
    if (!pendingSnapshotStorageKey) {
      return;
    }

    try {
      const storedIds = JSON.parse(
        window.sessionStorage.getItem(pendingSnapshotStorageKey) ?? "null",
      ) as unknown;

      if (
        Array.isArray(storedIds) &&
        storedIds.every((value) => typeof value === "string")
      ) {
        knownPendingIdsRef.current = new Set(storedIds);
        hasInitializedRef.current = true;
      }
    } catch {
      // Invalid or unavailable session storage falls back to the first snapshot.
    }
  }, [pendingSnapshotStorageKey]);

  useEffect(() => {
    if (realtimeEventsEnabled && typeof window !== "undefined") {
      let isCancelled = false;
      let timeoutId: number | null = null;
      let socketRetryTimeoutId: number | null = null;
      let socketRetryDelayMs = 500;
      let webSocket: WebSocket | null = null;
      let eventSource: EventSource | null = null;

      const handleReady = () => {
        void syncRequests();
      };
      const handleRequestEvent = (data: string, lastEventId = "") => {
        try {
          const detail = JSON.parse(data) as {
            eventId?: string;
            kind?: string;
            replayed?: boolean;
            requestId?: string;
            status?: string;
          };
          const eventId = detail.eventId ?? lastEventId;

          if (
            eventId &&
            lastRealtimeEventIdRef.current &&
            BigInt(eventId) <= BigInt(lastRealtimeEventIdRef.current)
          ) {
            return;
          }

          if (eventId) {
            lastRealtimeEventIdRef.current = eventId;
          }

          const prefix =
            detail.kind === "charge"
              ? "charge"
              : detail.kind === "domain_exchange"
                ? "domain-exchange"
                : detail.kind === "distributor_withdrawal"
                  ? "distributor-withdrawal"
                  : null;
          const pendingKey =
            prefix && detail.requestId ? `${prefix}:${detail.requestId}` : null;
          const wasPending = pendingKey
            ? knownPendingIdsRef.current.has(pendingKey)
            : false;

          if (
            reliableNoticeSoundEnabled &&
            !eventDrivenSnapshotEnabled &&
            pendingKey &&
            !isSyncingRef.current
          ) {
            if (detail.status === "PENDING") {
              knownPendingIdsRef.current.add(pendingKey);
              persistKnownPendingIds(knownPendingIdsRef.current);

              if (!wasPending && !detail.replayed) {
                setNoticeMessage("1건 신규 신청");
                void playNoticeSoundWithRetry();
              }
            } else {
              knownPendingIdsRef.current.delete(pendingKey);
              persistKnownPendingIds(knownPendingIdsRef.current);
            }
          }

          if (eventDrivenSnapshotEnabled && pendingKey) {
            if (detail.status === "PENDING") {
              knownPendingIdsRef.current.add(pendingKey);
            } else {
              knownPendingIdsRef.current.delete(pendingKey);
            }

            const snapshot = createPendingSnapshot(knownPendingIdsRef.current);
            const counts = collectPendingSnapshot(snapshot).counts;

            try {
              window.sessionStorage.setItem(
                pendingRequestCountsStorageKey,
                JSON.stringify(counts),
              );
            } catch {
              // Session storage can be unavailable in restricted browser modes.
            }

            window.dispatchEvent(
              new CustomEvent<PendingRequestCounts>(pendingRequestCountsEventName, {
                detail: counts,
              }),
            );
            window.dispatchEvent(
              new CustomEvent<RequestNotificationSnapshot>(
                requestNotificationSnapshotEventName,
                { detail: snapshot },
              ),
            );

            if (
              detail.status === "PENDING" &&
              !wasPending &&
              !detail.replayed
            ) {
              setNoticeMessage("1건 신규 신청");
              void playNoticeSoundWithRetry();
            }
          }

          window.dispatchEvent(
            new CustomEvent(requestRealtimeEventName, {
              detail,
            }),
          );
        } catch {
          // Ignore malformed realtime payloads and rely on the next refresh.
        }

        if (!eventDrivenSnapshotEnabled) {
          void syncRequests();
        }
      };

      if (eventDrivenSnapshotEnabled) {
        const connectWebSocket = () => {
          if (isCancelled) {
            return;
          }

          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const socketUrl = new URL("/api/request-socket", window.location.href);
          socketUrl.protocol = protocol;

          if (lastRealtimeEventIdRef.current) {
            socketUrl.searchParams.set(
              "cursor",
              lastRealtimeEventIdRef.current,
            );
          }

          const socket = new WebSocket(socketUrl);
          webSocket = socket;

          socket.onopen = () => {
            socketRetryDelayMs = 500;
            setNoticeMessage("실시간 연결 준비중");
          };
          socket.onmessage = (message) => {
            try {
              const payload = JSON.parse(String(message.data)) as {
                cursor?: string | null;
                event?: {
                  eventId?: string;
                  kind?: string;
                  replayed?: boolean;
                  requestId?: string;
                  status?: string;
                };
                type?: string;
              };

              if (payload.type === "ready") {
                if (payload.cursor) {
                  lastRealtimeEventIdRef.current = payload.cursor;
                }
                setNoticeMessage("실시간 연결됨");
                handleReady();
              } else if (payload.type === "request-event" && payload.event) {
                handleRequestEvent(JSON.stringify(payload.event));
              } else if (payload.type === "error") {
                setNoticeMessage("실시간 재연결 중");
              }
            } catch {
              // Ignore malformed socket messages and rely on cursor recovery.
            }
          };
          socket.onerror = () => {
            setNoticeMessage("실시간 재연결 중");
          };
          socket.onclose = () => {
            if (webSocket === socket) {
              webSocket = null;
            }

            if (isCancelled) {
              return;
            }

            setNoticeMessage("실시간 재연결 중");
            socketRetryTimeoutId = window.setTimeout(() => {
              socketRetryTimeoutId = null;
              connectWebSocket();
            }, socketRetryDelayMs);
            socketRetryDelayMs = Math.min(socketRetryDelayMs * 2, 5000);
          };
        };

        connectWebSocket();
      } else if ("EventSource" in window) {
        eventSource = new EventSource(realtimeEventsPath);
        const handleEventSourceReady = (event: MessageEvent<string>) => {
          if (event.lastEventId) {
            lastRealtimeEventIdRef.current = event.lastEventId;
          }

          handleReady();
        };
        const handleEventSourceRequest = (event: MessageEvent<string>) => {
          handleRequestEvent(event.data, event.lastEventId);
        };

        eventSource.addEventListener("ready", handleEventSourceReady);
        eventSource.addEventListener("request-event", handleEventSourceRequest);
        eventSource.addEventListener("replay-error", () => {
          setNoticeMessage("실시간 복구 확인 중");
          void syncRequests();
        });
        eventSource.onerror = () => {
          setNoticeMessage("실시간 재연결 중");

          if (reliableRequestEventRecoveryEnabled) {
            void syncRequests();
          }
        };
      }

      async function runFallbackSync() {
        if (isCancelled) {
          return;
        }

        await syncRequests();

        if (!isCancelled) {
          timeoutId = window.setTimeout(() => {
            void runFallbackSync();
          }, fallbackPollIntervalMs);
        }
      }

      void runFallbackSync();

      return () => {
        isCancelled = true;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        if (socketRetryTimeoutId !== null) {
          window.clearTimeout(socketRetryTimeoutId);
        }
        webSocket?.close(1000, "page closed");
        eventSource?.close();
        clearNoticeRetry();
      };
    }

    ensureAudio();

    let isCancelled = false;
    let timeoutId: number | null = null;

    async function runSync() {
      if (isCancelled) {
        return;
      }

      await syncRequests();

      if (!isCancelled) {
        timeoutId = window.setTimeout(() => {
          void runSync();
        }, fallbackPollIntervalMs);
      }
    }

    void runSync();

    return () => {
      isCancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      clearNoticeRetry();
    };
  }, [
    clearNoticeRetry,
    ensureAudio,
    eventDrivenSnapshotEnabled,
    fallbackPollIntervalMs,
    persistKnownPendingIds,
    realtimeEventsEnabled,
    realtimeEventsPath,
    reliableRequestEventRecoveryEnabled,
    reliableNoticeSoundEnabled,
    playNoticeSoundWithRetry,
    syncRequests,
  ]);

  useEffect(() => {
    function handleRefreshRequest() {
      void syncRequests();
    }

    window.addEventListener(
      requestNotifierRefreshEventName,
      handleRefreshRequest,
    );

    return () => {
      window.removeEventListener(
        requestNotifierRefreshEventName,
        handleRefreshRequest,
      );
    };
  }, [syncRequests]);

  useEffect(() => {
    ensureAudio();

    if (reliableNoticeSoundEnabled) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void unlockNoticeSound();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [ensureAudio, reliableNoticeSoundEnabled, unlockNoticeSound]);

  useEffect(() => {
    if (reliableNoticeSoundEnabled) {
      return;
    }

    let isUnlocked = false;

    function handleUserGesture() {
      if (isUnlocked) {
        return;
      }

      isUnlocked = true;
      void unlockNoticeSound();
      window.removeEventListener("pointerdown", handleUserGesture);
      window.removeEventListener("keydown", handleUserGesture);
    }

    window.addEventListener("pointerdown", handleUserGesture);
    window.addEventListener("keydown", handleUserGesture);

    return () => {
      window.removeEventListener("pointerdown", handleUserGesture);
      window.removeEventListener("keydown", handleUserGesture);
    };
  }, [reliableNoticeSoundEnabled, unlockNoticeSound]);

  return (
    <div className="hidden items-center gap-2 sm:flex">
      <button
        type="button"
        onClick={activateNoticeSound}
        className={`h-10 items-center rounded-2xl border px-3 text-xs font-semibold transition sm:inline-flex ${
          isSoundReady
            ? "border-cyan-300/24 bg-cyan-400/12 text-cyan-50 hover:bg-cyan-400/18"
            : "border-amber-300/24 bg-amber-400/12 text-amber-100 hover:bg-amber-400/18"
        }`}
        title="충전신청, 도메인환전, 총판환전 신규 신청 알림음"
      >
        {noticeMessage}
      </button>
      <NotificationVolumeControl compact />
    </div>
  );
}

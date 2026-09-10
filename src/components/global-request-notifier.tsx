"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationVolumeControl } from "@/components/notification-volume-control";
import { useNotificationSoundVolume } from "@/lib/notification-sound-volume";
import { createRealtimeNoticeLedger } from "@/lib/realtime-notice-ledger";

const noticeSoundPath = "/sounds/notice.mp3";
const defaultPollIntervalMs = 1000;
const defaultDisconnectedFallbackPollIntervalMs = 10_000;
const webSocketReadyTimeoutMs = 8_000;
const webSocketRecycleIntervalMs = 12 * 60_000;
const webSocketHeartbeatIntervalMs = 15_000;
const webSocketHeartbeatTimeoutMs = 45_000;
const webSocketReconnectGraceMs = 5_000;
const noticeSoundReadyKey = "winpay-notice-sound-ready";
const pendingNoticeSnapshotKey = "winpay-pending-notice-snapshot";
const noticeRetryDelayMs = 1200;
const maxNoticePlayAttempts = 3;
const maxListSyncWaitMs = 2500;
const realtimeClientInstanceKey = "winpay-realtime-client-instance";
const realtimeCursorKey = "winpay-realtime-cursor";

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

export type RequestRealtimeDetail = {
  eventId?: string;
  kind?: string;
  replayed?: boolean;
  requestId?: string;
  status?: string;
  outboxCreatedAt?: string;
  railwayReceivedAt?: string;
  railwayBroadcastAt?: string;
  waitUntil: (promise: Promise<unknown>) => void;
};

export const pendingRequestCountsEventName = "pending-request-counts";
export const requestNotificationSyncEventName = "request-notification-sync";
export const requestNotificationSnapshotEventName =
  "request-notification-snapshot";
export const requestNotifierRefreshEventName = "request-notifier-refresh";
export const requestRealtimeEventName = "request-realtime-event";
export const pendingRequestCountsStorageKey = "pending-request-counts-snapshot";

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });

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
  webSocketTransportEnabled?: boolean;
  externalWebSocketTransportEnabled?: boolean;
  periodicFallbackSyncEnabled?: boolean;
  disconnectedFallbackPollIntervalMs?: number;
  fallbackPollIntervalMs?: number;
  reliableNoticeSoundEnabled?: boolean;
  reliableRequestEventRecoveryEnabled?: boolean;
  debugRealtimeEvents?: boolean;
  noticeScopeKey?: string;
  realtimeMode?: "legacy" | "websocket";
  realtimeModeReason?: string;
  realtimeBuildVersion?: string;
};

export function GlobalRequestNotifier({
  realtimeEventsEnabled = false,
  realtimeEventsPath = "/api/request-events",
  eventDrivenSnapshotEnabled = false,
  webSocketTransportEnabled = false,
  externalWebSocketTransportEnabled = false,
  periodicFallbackSyncEnabled = true,
  disconnectedFallbackPollIntervalMs = defaultDisconnectedFallbackPollIntervalMs,
  fallbackPollIntervalMs = defaultPollIntervalMs,
  reliableNoticeSoundEnabled = false,
  reliableRequestEventRecoveryEnabled = false,
  debugRealtimeEvents = false,
  noticeScopeKey,
  realtimeMode = "legacy",
  realtimeModeReason = "not-provided",
  realtimeBuildVersion = "unknown",
}: GlobalRequestNotifierProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { volume: notificationSoundVolume } = useNotificationSoundVolume();
  const notificationSoundVolumeRef = useRef(notificationSoundVolume);
  const knownPendingIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);
  const isSyncingRef = useRef(false);
  const retryTimeoutRef = useRef<number | null>(null);
  const lastRealtimeEventIdRef = useRef<string | null>(null);
  const noticeLedgerRef = useRef<ReturnType<typeof createRealtimeNoticeLedger> | null>(null);
  const noticeLedgerScopeRef = useRef<string | undefined>(undefined);
  const realtimeDiagnosticRef = useRef({
    mode: realtimeMode,
    modeReason: realtimeModeReason,
    tokenStatus: "not-requested",
    wsStatus: "not-connected",
    fallbackReason: "none",
    buildVersion: realtimeBuildVersion,
    clientInstanceId: "unknown",
    visibilityState: "unknown",
    connectedAt: null as string | null,
    lastHeartbeatAt: null as string | null,
    timeoutDetectedAt: null as string | null,
    closeCode: null as number | null,
    closeReason: null as string | null,
    fallbackEnteredAt: null as string | null,
  });

  const reportRealtimeDiagnostic = useCallback((
    event: string,
    update: Partial<typeof realtimeDiagnosticRef.current> = {},
  ) => {
    realtimeDiagnosticRef.current = {
      ...realtimeDiagnosticRef.current,
      ...update,
      visibilityState: typeof document === "undefined"
        ? "unknown"
        : document.visibilityState,
    };
    void fetch("/api/realtime-diagnostics", {
      method: "POST",
      cache: "no-store",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...realtimeDiagnosticRef.current }),
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    realtimeDiagnosticRef.current = {
      ...realtimeDiagnosticRef.current,
      mode: realtimeMode,
      modeReason: realtimeModeReason,
      buildVersion: realtimeBuildVersion,
    };
  }, [realtimeBuildVersion, realtimeMode, realtimeModeReason]);
  const getNoticeLedger = useCallback(() => {
    if (!noticeLedgerRef.current || noticeLedgerScopeRef.current !== noticeScopeKey) {
      const storage = {
        getItem: (key: string) => window.sessionStorage.getItem(key),
        setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value),
      };
      noticeLedgerRef.current = createRealtimeNoticeLedger(storage,
        `winpay-realtime-notices:${noticeScopeKey ?? "default"}`);
      noticeLedgerScopeRef.current = noticeScopeKey;
    }
    return noticeLedgerRef.current;
  }, [noticeScopeKey]);
  const [isSoundReady, setIsSoundReady] = useState(
    reliableNoticeSoundEnabled ? reliableNoticeSoundReady : true,
  );
  const [noticeMessage, setNoticeMessage] = useState(
    reliableNoticeSoundEnabled && !reliableNoticeSoundReady
      ? "알림음 켜기"
      : "알림 대기중",
  );
  const [realtimeDebugStage, setRealtimeDebugStage] = useState("idle");

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
          return true;
        } catch {
          markNoticeBlocked();
        }

        return false;
      }

      for (let attempt = 1; attempt <= maxNoticePlayAttempts; attempt += 1) {
        try {
          await playNoticeSound();
          return true;
        } catch {
          markNoticeBlocked();
        }

        if (attempt >= maxNoticePlayAttempts) {
          return false;
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
      const backlog = eventDrivenSnapshotEnabled && webSocketTransportEnabled
        ? getNoticeLedger().pending() : [];
      for (const [index, [eventId, requestKey]] of backlog.entries()) {
        if (index > 0) await playNoticeSound();
        getNoticeLedger().complete(eventId, requestKey);
      }
      markNoticeReady("알림음 켜짐");
    } catch {
      markNoticeBlocked();
    }
  }, [clearNoticeRetry, getNoticeLedger, markNoticeBlocked, markNoticeReady, playNoticeSound, eventDrivenSnapshotEnabled, webSocketTransportEnabled]);

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
        {
          headers: {
            "X-Realtime-Diagnostic": JSON.stringify(realtimeDiagnosticRef.current),
          },
        },
      );

      // A temporary API failure must not erase the baseline and replay old alerts.
      if (!data?.pendingIds) {
        return;
      }

      const pendingSnapshot = collectPendingSnapshot(data);
      const nextPendingIds = pendingSnapshot.ids;
      const newPendingKeys = [...nextPendingIds].filter(
        (id) => !knownPendingIdsRef.current.has(id),
      );
      const newPendingCount = newPendingKeys.length;
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
        if (eventDrivenSnapshotEnabled && webSocketTransportEnabled) {
          const sounded = await playNoticeSoundWithRetry();
          if (sounded) getNoticeLedger().completeFallback(newPendingKeys);
        } else {
          void playNoticeSoundWithRetry();
        }
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [persistKnownPendingIds, playNoticeSoundWithRetry, eventDrivenSnapshotEnabled, webSocketTransportEnabled, getNoticeLedger]);

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
      let socketReadyTimeoutId: number | null = null;
      let socketRecycleTimeoutId: number | null = null;
      let socketFallbackGraceTimeoutId: number | null = null;
      let disconnectedFallbackTimeoutId: number | null = null;
      let socketRetryDelayMs = 500;
      let isSocketReady = false;
      let outageSyncStarted = false;
      let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
      let lastPongAt = 0;
      let webSocket: WebSocket | null = null;
      let eventSource: EventSource | null = null;
      let eventHandlingQueue = Promise.resolve();
      const scopedRealtimeCursorKey = `${realtimeCursorKey}:${noticeScopeKey ?? "default"}`;
      let clientInstanceId = "";

      try {
        clientInstanceId =
          window.sessionStorage.getItem(realtimeClientInstanceKey) ||
          window.crypto.randomUUID();
        window.sessionStorage.setItem(realtimeClientInstanceKey, clientInstanceId);
        lastRealtimeEventIdRef.current =
          window.sessionStorage.getItem(scopedRealtimeCursorKey);
      } catch {
        clientInstanceId = window.crypto.randomUUID();
      }
      realtimeDiagnosticRef.current.clientInstanceId = clientInstanceId;
      reportRealtimeDiagnostic("client-mode-mounted", {
        tokenStatus: externalWebSocketTransportEnabled
          ? "not-requested"
          : "not-required",
        wsStatus: webSocketTransportEnabled ? "initializing" : "not-connected",
        fallbackReason: periodicFallbackSyncEnabled ? "legacy-periodic" : "none",
      });

      const persistRealtimeCursor = (eventId: string | null | undefined) => {
        if (!eventId) {
          return;
        }

        lastRealtimeEventIdRef.current = eventId;

        try {
          window.sessionStorage.setItem(scopedRealtimeCursorKey, eventId);
        } catch {
          // Session storage can be unavailable in restricted browser modes.
        }
      };

      const clearSocketTimer = (timerId: number | null) => {
        if (timerId !== null) {
          window.clearTimeout(timerId);
        }
      };

      const scheduleDisconnectedFallbackSync = () => {
        if (
          isCancelled ||
          isSocketReady ||
          periodicFallbackSyncEnabled ||
          disconnectedFallbackTimeoutId !== null
        ) {
          return;
        }

        disconnectedFallbackTimeoutId = window.setTimeout(async () => {
          disconnectedFallbackTimeoutId = null;
          await syncRequests();
          scheduleDisconnectedFallbackSync();
        }, disconnectedFallbackPollIntervalMs);
      };

      const handleReady = () => {
        void syncRequests();
      };
      const beginSocketFallback = (reason: string) => {
        isSocketReady = false;
        if (!isCancelled && !outageSyncStarted) {
          outageSyncStarted = true;
          reportRealtimeDiagnostic("fallback-entered", {
            wsStatus: "disconnected",
            fallbackReason: reason,
            fallbackEnteredAt: new Date().toISOString(),
          });
          void syncRequests();
        }
        scheduleDisconnectedFallbackSync();
      };
      const scheduleSocketFallback = (reason: string) => {
        if (
          isCancelled ||
          isSocketReady ||
          periodicFallbackSyncEnabled ||
          socketFallbackGraceTimeoutId !== null
        ) {
          return;
        }

        socketFallbackGraceTimeoutId = window.setTimeout(() => {
          socketFallbackGraceTimeoutId = null;
          if (!isCancelled && !isSocketReady) {
            beginSocketFallback(reason);
          }
        }, webSocketReconnectGraceMs);
      };
      const handleRequestEvent = async (data: string, lastEventId = "") => {
        const listSyncPromises: Promise<unknown>[] = [];
        let soundRequested = false;

        try {
          const detail = JSON.parse(data) as Omit<RequestRealtimeDetail, "waitUntil">;
          const eventId = detail.eventId ?? lastEventId;

          if (debugRealtimeEvents) {
            console.info("[maple-sse-debug] browser-event-received", {
              eventId,
              kind: detail.kind,
              requestId: detail.requestId,
              status: detail.status,
            });
            setRealtimeDebugStage(`received:${eventId || "unknown"}`);
          }

          const duplicate = !!(
            eventId &&
            lastRealtimeEventIdRef.current &&
            BigInt(eventId) <= BigInt(lastRealtimeEventIdRef.current)
          );

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

          if (eventDrivenSnapshotEnabled && webSocketTransportEnabled && eventId && pendingKey && detail.status === "PENDING") {
            const ledger = getNoticeLedger();
            if (ledger.has(eventId, pendingKey)) {
              ledger.complete(eventId, pendingKey);
            } else {
              ledger.queue(eventId, pendingKey);
              setNoticeMessage("1건 신규 신청");
              soundRequested = true;
              const sounded = await playNoticeSoundWithRetry();
              if (sounded) {
                ledger.complete(eventId, pendingKey);
              }
            }
          }
          if (duplicate) return { duplicate: true, soundRequested };

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
                soundRequested = true;
                listSyncPromises.push(playNoticeSoundWithRetry());
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
              !webSocketTransportEnabled &&
              detail.status === "PENDING" &&
              !wasPending &&
              !detail.replayed
            ) {
              setNoticeMessage("1건 신규 신청");
              soundRequested = true;
              listSyncPromises.push(playNoticeSoundWithRetry());
            }
          }

          window.dispatchEvent(
            new CustomEvent(requestRealtimeEventName, {
              detail: {
                ...detail,
                waitUntil: (promise: Promise<unknown>) => {
                  listSyncPromises.push(Promise.resolve(promise).catch(() => undefined));
                },
              } satisfies RequestRealtimeDetail,
            }),
          );

          if (!eventDrivenSnapshotEnabled) {
            listSyncPromises.push(syncRequests());
          }

          await waitForListSync(listSyncPromises);
          if (eventId) persistRealtimeCursor(eventId);

          if (debugRealtimeEvents) {
            console.info("[maple-sse-debug] browser-ui-events-dispatched", {
              eventId,
              kind: detail.kind,
              requestId: detail.requestId,
            });
            setRealtimeDebugStage(`ui-updated:${eventId || "unknown"}`);
          }
          return { duplicate: false, soundRequested };
        } catch {
          // Ignore malformed realtime payloads and rely on the next refresh.
          return { duplicate: false, soundRequested };
        }
      };

      if (eventDrivenSnapshotEnabled && webSocketTransportEnabled) {
        const connectWebSocket = async () => {
          if (isCancelled) {
            return;
          }

          if (webSocket) {
            webSocket.onclose = null;
            webSocket.close(1000, "replaced connection");
            webSocket = null;
          }

          let socketUrl: URL;
          let authToken: string | null = null;

          if (externalWebSocketTransportEnabled) {
            reportRealtimeDiagnostic("token-requested", {
              tokenStatus: "requesting",
              wsStatus: "not-connected",
            });
            try {
              const tokenResponse = await fetch(
                `/api/realtime-token?clientInstanceId=${encodeURIComponent(clientInstanceId)}`,
                { cache: "no-store" },
              );
              const tokenPayload = (await tokenResponse.json().catch(() => null)) as {
                token?: string;
                webSocketUrl?: string;
              } | null;

              if (!tokenResponse.ok || !tokenPayload?.token || !tokenPayload.webSocketUrl) {
                throw new Error("Realtime token unavailable");
              }

              socketUrl = new URL(tokenPayload.webSocketUrl);
              authToken = tokenPayload.token;
              reportRealtimeDiagnostic("token-received", {
                tokenStatus: "received",
                wsStatus: "connecting",
              });
            } catch (error) {
              setNoticeMessage("실시간 재연결 중");
              const reason = error instanceof Error
                ? error.message
                : "token-request-failed";
              reportRealtimeDiagnostic("token-failed", {
                tokenStatus: "failed",
                wsStatus: "not-connected",
                fallbackReason: reason,
              });
              scheduleSocketFallback(reason);
              socketRetryTimeoutId = window.setTimeout(() => {
                socketRetryTimeoutId = null;
                void connectWebSocket();
              }, socketRetryDelayMs);
              socketRetryDelayMs = Math.min(socketRetryDelayMs * 2, 5000);
              return;
            }
          } else {
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            socketUrl = new URL("/api/request-socket", window.location.href);
            socketUrl.protocol = protocol;
          }

          if (!externalWebSocketTransportEnabled && lastRealtimeEventIdRef.current) {
            socketUrl.searchParams.set(
              "cursor",
              lastRealtimeEventIdRef.current,
            );
          }

          const socket = new WebSocket(socketUrl);
          webSocket = socket;

          socket.onopen = () => {
            socketRetryDelayMs = 500;
            isSocketReady = false;
            setNoticeMessage("실시간 연결 준비중");
            reportRealtimeDiagnostic("websocket-open", {
              tokenStatus: authToken ? "received" : "not-required",
              wsStatus: "open-awaiting-ready",
              fallbackReason: "none",
              connectedAt: new Date().toISOString(),
              timeoutDetectedAt: null,
              closeCode: null,
              closeReason: null,
            });

            if (authToken) {
              socket.send(JSON.stringify({
                type: "auth",
                token: authToken,
                clientInstanceId,
                lastProcessedEventId: lastRealtimeEventIdRef.current,
              }));
            }

            clearSocketTimer(socketReadyTimeoutId);
            socketReadyTimeoutId = window.setTimeout(() => {
              if (webSocket === socket && !isSocketReady) {
                socket.close(1013, "ready timeout");
              }
            }, webSocketReadyTimeoutMs);

            clearSocketTimer(socketRecycleTimeoutId);
            socketRecycleTimeoutId = window.setTimeout(() => {
              if (webSocket === socket) {
                socket.close(1000, "scheduled reconnect");
              }
            }, webSocketRecycleIntervalMs);
          };
          socket.onmessage = (message) => {
            const clientReceivedAt = new Date().toISOString();
            try {
              const payload = JSON.parse(String(message.data)) as {
                cursor?: string | null;
                event?: {
                  eventId?: string;
                  kind?: string;
                  replayed?: boolean;
                  requestId?: string;
                  status?: string;
                  outboxCreatedAt?: string;
                  railwayReceivedAt?: string;
                  railwayBroadcastAt?: string;
                };
                type?: string;
                mode?: "legacy" | "websocket";
                clientSentAt?: string;
                serverReceivedAt?: string;
                serverSentAt?: string;
              };

              if (payload.type === "pong") {
                lastPongAt = Date.now();
                const browserReceivedAt = new Date().toISOString();
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({
                    type: "heartbeat-observed",
                    clientSentAt: payload.clientSentAt,
                    serverReceivedAt: payload.serverReceivedAt,
                    serverSentAt: payload.serverSentAt,
                    browserReceivedAt,
                    browserRespondedAt: new Date().toISOString(),
                    visibilityState: document.visibilityState,
                  }));
                }
              } else if (payload.type === "ready") {
                clearSocketTimer(socketReadyTimeoutId);
                socketReadyTimeoutId = null;
                eventHandlingQueue = eventHandlingQueue.then(async () => {
                  if (isCancelled || webSocket !== socket || socket.readyState !== WebSocket.OPEN) return;
                  await syncRequests();
                  if (isCancelled || webSocket !== socket || socket.readyState !== WebSocket.OPEN) return;
                  if (payload.cursor) persistRealtimeCursor(payload.cursor);
                  isSocketReady = true;
                  outageSyncStarted = false;
                  lastPongAt = Date.now();
                  clearSocketTimer(socketFallbackGraceTimeoutId);
                  socketFallbackGraceTimeoutId = null;
                  clearInterval(heartbeatTimer);
                  heartbeatTimer = setInterval(() => {
                    if (isCancelled || webSocket !== socket) return;
                    if (Date.now() - lastPongAt > webSocketHeartbeatTimeoutMs) {
                      const timeoutDetectedAt = new Date().toISOString();
                      if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                          type: "heartbeat-timeout",
                          lastPongAt: new Date(lastPongAt).toISOString(),
                          detectedAt: timeoutDetectedAt,
                          visibilityState: document.visibilityState,
                        }));
                      }
                      reportRealtimeDiagnostic("heartbeat-timeout", {
                        wsStatus: "heartbeat-timeout",
                        fallbackReason: "reconnecting-before-fallback",
                        lastHeartbeatAt: new Date(lastPongAt).toISOString(),
                        timeoutDetectedAt,
                      });
                      socket.close(1013, "heartbeat timeout");
                    } else if (socket.readyState === WebSocket.OPEN) {
                      socket.send(JSON.stringify({
                        type: "ping",
                        clientSentAt: new Date().toISOString(),
                        visibilityState: document.visibilityState,
                      }));
                    }
                  }, webSocketHeartbeatIntervalMs);
                  window.dispatchEvent(new Event("realtime-control-refresh"));
                  clearSocketTimer(disconnectedFallbackTimeoutId);
                  disconnectedFallbackTimeoutId = null;
                  setNoticeMessage("실시간 연결됨");
                  reportRealtimeDiagnostic("websocket-ready", {
                    wsStatus: "ready",
                    fallbackReason: "none",
                    lastHeartbeatAt: new Date(lastPongAt).toISOString(),
                    fallbackEnteredAt: null,
                  });
                }).catch(() => {
                  reportRealtimeDiagnostic("websocket-state-sync-failed", {
                    wsStatus: "state-sync-failed",
                    fallbackReason: "state-synchronization-failed",
                  });
                  socket.close(1013, "state synchronization failed");
                });
              } else if (payload.type === "request-event" && payload.event) {
                eventHandlingQueue = eventHandlingQueue.then(async () => {
                  const result = await handleRequestEvent(JSON.stringify(payload.event));
                  if (payload.event?.eventId && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                      type: "ack",
                      eventId: payload.event.eventId,
                      kind: payload.event.kind,
                      requestId: payload.event.requestId,
                      outboxCreatedAt: payload.event.outboxCreatedAt,
                      clientReceivedAt,
                      uiUpdatedAt: new Date().toISOString(),
                      duplicate: result.duplicate,
                      soundRequested: result.soundRequested,
                    }));
                  }
                }).catch(() => {
                  socket.close(1013, "event processing failed");
                });
              } else if (payload.type === "resync-required") {
                persistRealtimeCursor(payload.cursor);
                void syncRequests();
              } else if (payload.type === "control") {
                window.dispatchEvent(new CustomEvent("realtime-control-mode", {
                  detail: { mode: payload.mode },
                }));
              } else if (payload.type === "error") {
                setNoticeMessage("실시간 재연결 중");
                reportRealtimeDiagnostic("websocket-server-error", {
                  wsStatus: "server-error",
                  fallbackReason: "server-error-message",
                });
              }
            } catch {
              // Ignore malformed socket messages and rely on cursor recovery.
            }
          };
          socket.onerror = () => {
            isSocketReady = false;
            reportRealtimeDiagnostic("websocket-error", {
              wsStatus: "error",
              fallbackReason: "reconnecting-before-fallback",
            });
            setNoticeMessage("실시간 재연결 중");
            scheduleSocketFallback("websocket-error");
          };
          socket.onclose = (event) => {
            clearInterval(heartbeatTimer);
            isSocketReady = false;
            if (webSocket === socket) {
              webSocket = null;
            }

            if (isCancelled) {
              return;
            }

            clearSocketTimer(socketReadyTimeoutId);
            socketReadyTimeoutId = null;
            clearSocketTimer(socketRecycleTimeoutId);
            socketRecycleTimeoutId = null;
            const closeReason = `close-${event.code}-${event.reason || "no-reason"}`;
            reportRealtimeDiagnostic("websocket-closed", {
              wsStatus: closeReason,
              fallbackReason: "reconnecting-before-fallback",
              closeCode: event.code,
              closeReason: event.reason || "no-reason",
            });
            setNoticeMessage("실시간 재연결 중");
            scheduleSocketFallback(closeReason);
            socketRetryTimeoutId = window.setTimeout(() => {
              socketRetryTimeoutId = null;
              void connectWebSocket();
            }, socketRetryDelayMs);
            socketRetryDelayMs = Math.min(socketRetryDelayMs * 2, 5000);
          };
        };

        void connectWebSocket();
      } else if ("EventSource" in window) {
        reportRealtimeDiagnostic("legacy-eventsource-selected", {
          tokenStatus: "not-requested",
          wsStatus: "not-connected",
          fallbackReason: "legacy-sse",
        });
        if (debugRealtimeEvents) {
          console.info("[maple-sse-debug] browser-event-source-connecting", {
            path: realtimeEventsPath,
          });
        }

        const eventSourceUrl = new URL(realtimeEventsPath, window.location.href);
        eventSourceUrl.searchParams.set("clientInstanceId", clientInstanceId);
        eventSourceUrl.searchParams.set(
          "buildVersion",
          realtimeDiagnosticRef.current.buildVersion,
        );
        eventSource = new EventSource(eventSourceUrl);
        const handleEventSourceReady = (event: MessageEvent<string>) => {
          isSocketReady = true;
          clearSocketTimer(disconnectedFallbackTimeoutId);
          disconnectedFallbackTimeoutId = null;

          if (event.lastEventId) {
            lastRealtimeEventIdRef.current = event.lastEventId;
          }

          if (debugRealtimeEvents) {
            console.info("[maple-sse-debug] browser-event-source-ready", {
              lastEventId: event.lastEventId,
            });
            setRealtimeDebugStage(`ready:${event.lastEventId || "none"}`);
          }

          handleReady();
        };
        const handleEventSourceRequest = (event: MessageEvent<string>) => {
          void handleRequestEvent(event.data, event.lastEventId);
        };

        eventSource.addEventListener("ready", handleEventSourceReady);
        eventSource.addEventListener("request-event", handleEventSourceRequest);
        eventSource.addEventListener("replay-error", () => {
          setNoticeMessage("실시간 복구 확인 중");
          void syncRequests();
        });
        eventSource.onerror = () => {
          isSocketReady = false;
          setNoticeMessage("실시간 재연결 중");

          if (debugRealtimeEvents) {
            console.info("[maple-sse-debug] browser-event-source-error");
            setRealtimeDebugStage("error");
          }

          if (reliableRequestEventRecoveryEnabled) {
            void syncRequests();
          }

          scheduleDisconnectedFallbackSync();
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

      if (periodicFallbackSyncEnabled) {
        void runFallbackSync();
      } else {
        // Event-driven pilots use one initial authoritative snapshot. After
        // that, polling runs only while SSE/WebSocket is unavailable.
        void syncRequests();
      }

      return () => {
        isCancelled = true;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        if (socketRetryTimeoutId !== null) {
          window.clearTimeout(socketRetryTimeoutId);
        }
        clearSocketTimer(socketReadyTimeoutId);
        clearSocketTimer(socketRecycleTimeoutId);
        clearSocketTimer(socketFallbackGraceTimeoutId);
        clearSocketTimer(disconnectedFallbackTimeoutId);
        clearInterval(heartbeatTimer);
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
    periodicFallbackSyncEnabled,
    disconnectedFallbackPollIntervalMs,
    persistKnownPendingIds,
    realtimeEventsEnabled,
    realtimeEventsPath,
    reliableRequestEventRecoveryEnabled,
    reliableNoticeSoundEnabled,
    debugRealtimeEvents,
    webSocketTransportEnabled,
    getNoticeLedger,
    externalWebSocketTransportEnabled,
    noticeScopeKey,
    playNoticeSoundWithRetry,
    reportRealtimeDiagnostic,
    syncRequests,
  ]);

  const realtimeDebugOutput = debugRealtimeEvents ? (
    <output className="sr-only" aria-label="Maple 실시간 진단 상태">
      {realtimeDebugStage}
    </output>
  ) : null;

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
      {realtimeDebugOutput}
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

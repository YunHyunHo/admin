"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const noticeSoundPath = "/sounds/notice.mp3";
const pollIntervalMs = 1000;
const noticeSoundReadyKey = "winpay-notice-sound-ready";
const noticeRetryDelayMs = 1200;
const maxNoticePlayAttempts = 3;

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

export const pendingRequestCountsEventName = "pending-request-counts";
export const requestNotificationSnapshotEventName =
  "request-notification-snapshot";
export const requestNotifierRefreshEventName = "request-notifier-refresh";
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

export function GlobalRequestNotifier() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownPendingIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);
  const isSyncingRef = useRef(false);
  const retryTimeoutRef = useRef<number | null>(null);
  const [isSoundReady, setIsSoundReady] = useState(true);
  const [noticeMessage, setNoticeMessage] = useState("알림 대기중");

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(noticeSoundPath);
      audioRef.current.preload = "auto";
    }

    return audioRef.current;
  }, []);

  const clearNoticeRetry = useCallback(() => {
    if (retryTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = null;
  }, []);

  const markNoticeReady = useCallback((message: string) => {
    setIsSoundReady(true);
    setNoticeMessage(message);

    try {
      window.localStorage.setItem(noticeSoundReadyKey, "1");
    } catch {
      // Local storage can be unavailable in restricted browser modes.
    }
  }, []);

  const markNoticeBlocked = useCallback(() => {
    setIsSoundReady(false);
    setNoticeMessage("알림음 다시 켜기");
  }, []);

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
    [clearNoticeRetry, markNoticeBlocked, playNoticeSound],
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

      knownPendingIdsRef.current = nextPendingIds;

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
  }, [playNoticeSoundWithRetry]);

  useEffect(() => {
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
        }, pollIntervalMs);
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
  }, [clearNoticeRetry, ensureAudio, syncRequests]);

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
    const timeoutId = window.setTimeout(() => {
      void unlockNoticeSound();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [ensureAudio, unlockNoticeSound]);

  useEffect(() => {
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
  }, [unlockNoticeSound]);

  return (
    <button
      type="button"
      onClick={activateNoticeSound}
      className={`hidden h-10 items-center rounded-2xl border px-3 text-xs font-semibold transition sm:inline-flex ${
        isSoundReady
          ? "border-cyan-300/24 bg-cyan-400/12 text-cyan-50 hover:bg-cyan-400/18"
          : "border-amber-300/24 bg-amber-400/12 text-amber-100 hover:bg-amber-400/18"
      }`}
      title="충전신청, 도메인환전, 총판환전 신규 신청 알림음"
    >
      {noticeMessage}
    </button>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DomainExchangeRow } from "@/lib/domain-exchanges-types";

const noticeSoundPath = "/sounds/notice.mp3";
const pollIntervalMs = 5000;
const noticeSoundReadyKey = "winpay-notice-sound-ready";
const noticeRetryDelayMs = 1200;
const maxNoticePlayAttempts = 3;

type ChargeRequestsResponse = {
  pending?: Array<{ id: string }>;
  approved?: Array<{ id: string }>;
  rejected?: Array<{ id: string }>;
};

type PendingRowsResponse = {
  rows?: Array<{ id: string; status?: string }>;
};

type DomainExchangeRowsResponse = {
  rows?: DomainExchangeRow[];
};

export type PendingRequestCounts = {
  charges: number;
  domainExchanges: number;
  distributorWithdrawals: number;
};

export const pendingRequestCountsEventName = "pending-request-counts";
export const domainExchangeRowsEventName = "domain-exchange-rows";
export const requestNotifierRefreshEventName = "request-notifier-refresh";
export const pendingRequestCountsStorageKey = "pending-request-counts-snapshot";

function isPendingStatus(status: string | undefined) {
  return status === "승인중" || status === "PENDING";
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    return null;
  }

  return (await response.json().catch(() => null)) as T | null;
}

function collectPendingSnapshot(
  chargeData: ChargeRequestsResponse | null,
  domainExchangeData: PendingRowsResponse | null,
  distributorWithdrawalData: PendingRowsResponse | null,
) {
  const ids = new Set<string>();
  const counts: PendingRequestCounts = {
    charges: 0,
    domainExchanges: 0,
    distributorWithdrawals: 0,
  };

  for (const request of chargeData?.pending ?? []) {
    ids.add(`charge:${request.id}`);
    counts.charges += 1;
  }

  for (const request of chargeData?.approved ?? []) {
    ids.add(`charge:${request.id}`);
  }

  for (const request of chargeData?.rejected ?? []) {
    ids.add(`charge:${request.id}`);
  }

  for (const row of domainExchangeData?.rows ?? []) {
    if (isPendingStatus(row.status)) {
      ids.add(`domain-exchange:${row.id}`);
      counts.domainExchanges += 1;
    }
  }

  for (const row of distributorWithdrawalData?.rows ?? []) {
    if (isPendingStatus(row.status)) {
      ids.add(`distributor-withdrawal:${row.id}`);
      counts.distributorWithdrawals += 1;
    }
  }

  return { ids, counts };
}

export function GlobalRequestNotifier() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownPendingIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);
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
    const [chargeData, domainExchangeData, distributorWithdrawalData] =
      await Promise.all([
        fetchJson<ChargeRequestsResponse>("/api/charge-requests"),
        fetchJson<DomainExchangeRowsResponse>("/api/domain-exchanges"),
        fetchJson<PendingRowsResponse>("/api/distributor-withdrawals"),
      ]);

    const pendingSnapshot = collectPendingSnapshot(
      chargeData,
      domainExchangeData,
      distributorWithdrawalData,
    );
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

    if (domainExchangeData?.rows) {
      window.dispatchEvent(
        new CustomEvent<DomainExchangeRow[]>(domainExchangeRowsEventName, {
          detail: domainExchangeData.rows,
        }),
      );
    }

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      return;
    }

    if (newPendingCount === 0) {
      return;
    }

    setNoticeMessage(`${newPendingCount}건 신규 신청`);
    void playNoticeSoundWithRetry();
  }, [playNoticeSoundWithRetry]);

  useEffect(() => {
    ensureAudio();

    let isCancelled = false;

    async function runSync() {
      if (isCancelled) {
        return;
      }

      await syncRequests();
    }

    void runSync();
    const intervalId = window.setInterval(() => {
      void runSync();
    }, pollIntervalMs);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
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

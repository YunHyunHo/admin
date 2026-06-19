"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const noticeSoundPath = "/sounds/notice.mp3";
const pollIntervalMs = 5000;

type ChargeRequestsResponse = {
  pending?: Array<{ id: string }>;
};

type PendingRowsResponse = {
  rows?: Array<{ id: string; status?: string }>;
};

export type PendingRequestCounts = {
  charges: number;
  domainExchanges: number;
  distributorWithdrawals: number;
};

export const pendingRequestCountsEventName = "pending-request-counts";

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
  const [isSoundReady, setIsSoundReady] = useState(true);
  const [noticeMessage, setNoticeMessage] = useState("알림 대기중");

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(noticeSoundPath);
      audioRef.current.preload = "auto";
    }

    return audioRef.current;
  }, []);

  const playNoticeSound = useCallback(async () => {
    const audio = ensureAudio();
    audio.currentTime = 0;
    await audio.play();
    setIsSoundReady(true);
  }, [ensureAudio]);

  const activateNoticeSound = useCallback(async () => {
    try {
      await playNoticeSound();
      setNoticeMessage("알림음 켜짐");
    } catch {
      setIsSoundReady(false);
      setNoticeMessage("알림음 다시 켜기");
    }
  }, [playNoticeSound]);

  const unlockNoticeSound = useCallback(async () => {
    try {
      const audio = ensureAudio();
      audio.muted = true;
      audio.currentTime = 0;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      setIsSoundReady(true);
      setNoticeMessage("알림 대기중");
    } catch {
      setIsSoundReady(false);
      setNoticeMessage("알림음 다시 켜기");
    }
  }, [ensureAudio]);

  const syncRequests = useCallback(async () => {
    const [chargeData, domainExchangeData, distributorWithdrawalData] =
      await Promise.all([
        fetchJson<ChargeRequestsResponse>("/api/charge-requests"),
        fetchJson<PendingRowsResponse>("/api/domain-exchanges"),
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
    window.dispatchEvent(
      new CustomEvent<PendingRequestCounts>(pendingRequestCountsEventName, {
        detail: pendingSnapshot.counts,
      }),
    );

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      return;
    }

    if (newPendingCount === 0) {
      return;
    }

    setNoticeMessage(`${newPendingCount}건 신규 신청`);

    try {
      await playNoticeSound();
    } catch {
      setIsSoundReady(false);
      setNoticeMessage("알림음 다시 켜기");
    }
  }, [playNoticeSound]);

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
    };
  }, [ensureAudio, syncRequests]);

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

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

function collectPendingIds(
  chargeData: ChargeRequestsResponse | null,
  domainExchangeData: PendingRowsResponse | null,
  distributorWithdrawalData: PendingRowsResponse | null,
) {
  const ids = new Set<string>();

  for (const request of chargeData?.pending ?? []) {
    ids.add(`charge:${request.id}`);
  }

  for (const row of domainExchangeData?.rows ?? []) {
    if (isPendingStatus(row.status)) {
      ids.add(`domain-exchange:${row.id}`);
    }
  }

  for (const row of distributorWithdrawalData?.rows ?? []) {
    if (isPendingStatus(row.status)) {
      ids.add(`distributor-withdrawal:${row.id}`);
    }
  }

  return ids;
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

  const syncRequests = useCallback(async () => {
    const [chargeData, domainExchangeData, distributorWithdrawalData] =
      await Promise.all([
        fetchJson<ChargeRequestsResponse>("/api/charge-requests"),
        fetchJson<PendingRowsResponse>("/api/domain-exchanges"),
        fetchJson<PendingRowsResponse>("/api/distributor-withdrawals"),
      ]);

    const nextPendingIds = collectPendingIds(
      chargeData,
      domainExchangeData,
      distributorWithdrawalData,
    );
    const newPendingCount = [...nextPendingIds].filter(
      (id) => !knownPendingIdsRef.current.has(id),
    ).length;

    knownPendingIdsRef.current = nextPendingIds;

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

  return (
    <button
      type="button"
      onClick={activateNoticeSound}
      className={`hidden h-10 items-center rounded-2xl border px-3 text-xs font-semibold transition sm:inline-flex ${
        isSoundReady
          ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/14"
          : "border-amber-300/24 bg-amber-400/12 text-amber-100 hover:bg-amber-400/18"
      }`}
      title="충전신청, 도메인환전, 총판환전 신규 신청 알림음"
    >
      {noticeMessage}
    </button>
  );
}

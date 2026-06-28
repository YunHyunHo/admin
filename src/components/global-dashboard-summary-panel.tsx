"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  requestNotificationSnapshotEventName,
  type RequestNotificationSnapshot,
} from "@/components/global-request-notifier";
import { useDashboardSummaryOpen } from "@/components/use-dashboard-summary-open";
import { formatKoreanWon } from "@/lib/charge-utils";
import type { DashboardPartnerSummary } from "@/lib/dashboard-summary-repository";

const summaryRefreshEvent = "dashboard-summary-refresh";
const metricLabels = ["충전", "수수료", "환전", "보유"] as const;

function getSummaryTotals(items: DashboardPartnerSummary[]) {
  return items.reduce(
    (sum, item) => ({
      chargeTotal: sum.chargeTotal + item.chargeTotal,
      feeTotal: sum.feeTotal + item.feeTotal,
      exchangeTotal: sum.exchangeTotal + item.exchangeTotal,
      balanceTotal: sum.balanceTotal + item.balanceTotal,
    }),
    {
      chargeTotal: 0,
      feeTotal: 0,
      exchangeTotal: 0,
      balanceTotal: 0,
    },
  );
}

function getMetricValues(item: DashboardPartnerSummary) {
  return [
    item.chargeTotal,
    item.feeTotal,
    item.exchangeTotal,
    item.balanceTotal,
  ];
}

export function GlobalDashboardSummaryPanel({
  partnerSummaries: initialPartnerSummaries,
  canReorder = false,
}: {
  partnerSummaries?: DashboardPartnerSummary[];
  canReorder?: boolean;
}) {
  const isOpen = useDashboardSummaryOpen();
  const [partnerSummaries, setPartnerSummaries] = useState<
    DashboardPartnerSummary[] | null
  >(initialPartnerSummaries ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [orderErrorMessage, setOrderErrorMessage] = useState("");
  const pendingSignatureRef = useRef<string | null>(null);
  const visiblePartnerSummaries = useMemo(
    () => partnerSummaries ?? [],
    [partnerSummaries],
  );
  const totals = useMemo(
    () => getSummaryTotals(visiblePartnerSummaries),
    [visiblePartnerSummaries],
  );
  const totalValues = [
    totals.chargeTotal,
    totals.feeTotal,
    totals.exchangeTotal,
    totals.balanceTotal,
  ];

  useEffect(() => {
    function requestSummaryRefresh() {
      setPartnerSummaries(null);
    }

    function handleRequestSnapshot(event: Event) {
      const snapshot = (event as CustomEvent<RequestNotificationSnapshot>).detail;
      const signature = [
        ...snapshot.pendingIds.charges.map((id) => `charge:${id}`),
        ...snapshot.pendingIds.domainExchanges.map((id) => `exchange:${id}`),
        ...snapshot.pendingIds.distributorWithdrawals.map(
          (id) => `distributor-withdrawal:${id}`,
        ),
      ]
        .sort()
        .join("|");

      if (pendingSignatureRef.current === null) {
        pendingSignatureRef.current = signature;
        return;
      }

      if (pendingSignatureRef.current !== signature) {
        pendingSignatureRef.current = signature;
        requestSummaryRefresh();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        requestSummaryRefresh();
      }
    }

    window.addEventListener(summaryRefreshEvent, requestSummaryRefresh);
    window.addEventListener(requestNotificationSnapshotEventName, handleRequestSnapshot);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener(summaryRefreshEvent, requestSummaryRefresh);
      window.removeEventListener(
        requestNotificationSnapshotEventName,
        handleRequestSnapshot,
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || partnerSummaries !== null) {
      return;
    }

    let ignore = false;

    async function loadPartnerSummaries() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/dashboard-summary", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("현황 데이터를 불러오지 못했습니다.");
        }

        const payload = (await response.json()) as {
          partnerSummaries?: DashboardPartnerSummary[];
        };

        if (!ignore) {
          setPartnerSummaries(payload.partnerSummaries ?? []);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "현황 데이터를 불러오지 못했습니다.",
          );
          setPartnerSummaries([]);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadPartnerSummaries();

    return () => {
      ignore = true;
    };
  }, [isOpen, partnerSummaries]);

  async function movePartnerSummary(index: number, offset: -1 | 1) {
    if (!partnerSummaries || savingOrderId) {
      return;
    }

    const targetIndex = index + offset;

    if (targetIndex < 0 || targetIndex >= partnerSummaries.length) {
      return;
    }

    const previousItems = partnerSummaries;
    const nextItems = [...partnerSummaries];
    const [movedItem] = nextItems.splice(index, 1);

    nextItems.splice(targetIndex, 0, movedItem);
    setPartnerSummaries(nextItems);
    setSavingOrderId(movedItem.id);
    setOrderErrorMessage("");

    try {
      const response = await fetch("/api/dashboard-summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: nextItems.map((item) => item.id) }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        partnerSummaries?: DashboardPartnerSummary[];
      } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "업체 순번을 저장하지 못했습니다.");
      }

      setPartnerSummaries(payload?.partnerSummaries ?? nextItems);
    } catch (error) {
      setPartnerSummaries(previousItems);
      setOrderErrorMessage(
        error instanceof Error
          ? error.message
          : "업체 순번을 저장하지 못했습니다.",
      );
    } finally {
      setSavingOrderId(null);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <section
      data-dashboard-summary-panel
      className="border-b border-white/8 bg-[#0d1016]/86 px-4 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.16)] backdrop-blur-xl sm:px-6"
    >
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,_rgba(255,255,255,0.055)_0%,_rgba(255,255,255,0.026)_100%)]">
        <div className="flex flex-col gap-4 border-b border-white/10 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
              Partner Summary
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">
              도메인 업체 현황
            </h2>
            {orderErrorMessage ? (
              <p className="mt-2 text-xs font-medium text-rose-200/80">
                {orderErrorMessage}
              </p>
            ) : null}
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[720px]">
            {metricLabels.map((label, index) => (
              <div
                key={`global-summary-total-${label}`}
                className="rounded-2xl border border-white/8 bg-black/18 px-3 py-3 text-center"
              >
                <p className="text-xs font-semibold tracking-[0.16em] text-white/45">
                  {label}
                </p>
                <p className="mt-2 truncate text-base font-bold text-white">
                  {formatKoreanWon(totalValues[index])}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div
          data-dashboard-summary-details
          className="grid gap-px bg-white/8 p-px lg:grid-cols-2"
        >
          {isLoading ? (
            <div className="px-4 py-10 text-center text-sm text-white/42 lg:col-span-2">
              도메인 업체 현황을 불러오는 중입니다.
            </div>
          ) : errorMessage ? (
            <div className="px-4 py-10 text-center text-sm text-rose-200/80 lg:col-span-2">
              {errorMessage}
            </div>
          ) : visiblePartnerSummaries.length ? (
            visiblePartnerSummaries.map((item, index) => (
                <div
                  key={`global-summary-grid-${item.id}`}
                  className="grid min-h-[72px] grid-cols-2 gap-px bg-white/8 text-center text-sm text-white sm:grid-cols-[minmax(7rem,1fr)_repeat(4,minmax(5.25rem,1fr))] sm:gap-0"
                >
                  <div className="col-span-2 flex min-h-14 items-center justify-center gap-2 bg-[#181c24] px-3 font-semibold text-white/90 sm:col-span-1 sm:min-h-0 sm:border-r sm:border-white/8 sm:bg-white/[0.045] sm:px-2">
                    <span className="min-w-0 line-clamp-2 break-keep">
                      {item.name}
                    </span>
                    {canReorder ? (
                      <span className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          title={`${item.name} 순서를 위로 이동`}
                          aria-label={`${item.name} 순서를 위로 이동`}
                          disabled={index === 0 || savingOrderId !== null}
                          onClick={() => void movePartnerSummary(index, -1)}
                          className="grid h-6 w-6 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-white/64 transition hover:border-cyan-300/35 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-25"
                        >
                          <span aria-hidden="true">↑</span>
                        </button>
                        <button
                          type="button"
                          title={`${item.name} 순서를 아래로 이동`}
                          aria-label={`${item.name} 순서를 아래로 이동`}
                          disabled={
                            index === visiblePartnerSummaries.length - 1 ||
                            savingOrderId !== null
                          }
                          onClick={() => void movePartnerSummary(index, 1)}
                          className="grid h-6 w-6 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-white/64 transition hover:border-cyan-300/35 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-25"
                        >
                          <span aria-hidden="true">↓</span>
                        </button>
                      </span>
                    ) : null}
                  </div>
                  {getMetricValues(item).map((value, index) => (
                    <div
                      key={`${item.id}-${metricLabels[index]}`}
                      className="grid min-h-16 grid-rows-2 bg-[#12151c] sm:min-h-0 sm:border-r sm:border-white/8 sm:last:border-r-0"
                    >
                      <div className="flex items-center justify-center border-b border-white/8 bg-white/[0.025] px-2 text-xs font-semibold tracking-[0.12em] text-white/54">
                        {metricLabels[index]}
                      </div>
                      <div className="flex min-w-0 items-center justify-center px-2 font-bold">
                        <span className="truncate">
                          {formatKoreanWon(value)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
            ))
          ) : (
            <div className="px-4 py-10 text-center text-sm text-white/42 lg:col-span-2">
              표시할 도메인 업체 현황이 없습니다.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

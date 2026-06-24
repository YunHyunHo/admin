"use client";

import { useEffect, useMemo, useState } from "react";

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
}: {
  partnerSummaries?: DashboardPartnerSummary[];
}) {
  const isOpen = useDashboardSummaryOpen();
  const [partnerSummaries, setPartnerSummaries] = useState<
    DashboardPartnerSummary[] | null
  >(initialPartnerSummaries ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
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
    function handleSummaryRefresh() {
      setPartnerSummaries(null);
    }

    window.addEventListener(summaryRefreshEvent, handleSummaryRefresh);

    return () => {
      window.removeEventListener(summaryRefreshEvent, handleSummaryRefresh);
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
            visiblePartnerSummaries.map((item) => (
                <div
                  key={`global-summary-grid-${item.id}`}
                  className="grid min-h-[72px] grid-cols-[minmax(7rem,1fr)_repeat(4,minmax(5.25rem,1fr))] bg-[#12151c] text-center text-sm text-white"
                >
                  <div className="flex items-center justify-center border-r border-white/8 bg-white/[0.045] px-2 font-semibold text-white/90">
                    <span className="line-clamp-2 break-keep">
                      {item.name}
                    </span>
                  </div>
                  {getMetricValues(item).map((value, index) => (
                    <div
                      key={`${item.id}-${metricLabels[index]}`}
                      className="grid grid-rows-2 border-r border-white/8 last:border-r-0"
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

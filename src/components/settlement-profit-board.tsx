"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { formatKoreanWon } from "@/lib/charge-utils";
import {
  requestNotificationSnapshotEventName,
  type RequestNotificationSnapshot,
} from "@/components/global-request-notifier";

type SettlementProfitBoardProps = {
  companyName: string;
  initialDomainName: string;
  initialRows: DailyProfitRow[];
  initialSections?: ProfitSection[];
  initialTotals: {
    chargeTotal: number;
    feeTotal: number;
    companyFeeTotal: number;
    distributorFeeTotal: number;
    payoutTotal: number;
  };
};

type DailyProfitRow = {
  date: string;
  chargeTotal: number;
  feeTotal: number;
  companyFeeTotal: number;
  distributorFeeTotal: number;
  payoutTotal: number;
};

type ProfitSection = {
  id: string;
  title: string;
  category: "본사" | "업체" | "상위총판" | "총판";
  rows: DailyProfitRow[];
  totals: {
    chargeTotal: number;
    feeTotal: number;
    companyFeeTotal: number;
    distributorFeeTotal: number;
    payoutTotal: number;
  };
};

type SettlementProfitResponse = {
  domainName: string;
  rows: DailyProfitRow[];
  sections?: ProfitSection[];
  totals: {
    chargeTotal: number;
    feeTotal: number;
    companyFeeTotal: number;
    distributorFeeTotal: number;
    payoutTotal: number;
  };
};

const MIN_QUERY_DATE = "2026-01-01";
const dashboardSummaryRefreshEventName = "dashboard-summary-refresh";

function fromIsoDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${month}-${day}`;
}

function getTodayIsoDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function getMonthStartIsoDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(new Date());

  return `${today.slice(0, 8)}01`;
}

function clampDate(value: string, min: string, max: string) {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function createDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const date = String(cursor.getUTCDate()).padStart(2, "0");

    dates.push(`${year}-${month}-${date}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function fillRowsByDate(
  rows: DailyProfitRow[],
  startDate: string,
  endDate: string,
) {
  const rowMap = new Map(rows.map((row) => [row.date, row]));

  return createDateRange(startDate, endDate).map((isoDate) => {
    const key = isoDate.slice(5);

    return (
      rowMap.get(key) ?? {
        date: key,
        chargeTotal: 0,
        feeTotal: 0,
        companyFeeTotal: 0,
        distributorFeeTotal: 0,
        payoutTotal: 0,
      }
    );
  });
}

export function SettlementProfitBoard({
  companyName,
  initialDomainName,
  initialRows,
  initialSections,
  initialTotals,
}: SettlementProfitBoardProps) {
  const todayIsoDate = getTodayIsoDate();
  const monthStartIsoDate = getMonthStartIsoDate();
  const [startDate, setStartDate] = useState(monthStartIsoDate);
  const [endDate, setEndDate] = useState(todayIsoDate);
  const [domainName, setDomainName] = useState(initialDomainName);
  const [profitSections, setProfitSections] = useState<ProfitSection[]>(
    initialSections?.length
      ? initialSections
      : [
          {
            id: "headquarters",
            title: "본사",
            category: "본사",
            rows: initialRows.map((row) => ({
              ...row,
              feeTotal: row.companyFeeTotal,
              distributorFeeTotal: 0,
            })),
            totals: {
              chargeTotal: initialTotals.chargeTotal,
              feeTotal: initialTotals.companyFeeTotal,
              companyFeeTotal: initialTotals.companyFeeTotal,
              distributorFeeTotal: 0,
              payoutTotal: initialTotals.payoutTotal,
            },
          },
        ],
  );
  const [totals, setTotals] = useState(initialTotals);
  const [message, setMessage] = useState("서버 API 기준 데이터입니다.");
  const isLoadingRef = useRef(false);
  const queuedRangeRef = useRef<[string, string] | null>(null);
  const loadRowsRef = useRef<(startDate: string, endDate: string) => Promise<void>>(
    async () => undefined,
  );
  const pendingSignatureRef = useRef<string | null>(null);
  const visibleSections = profitSections.length
    ? profitSections
    : [
        {
          id: "empty-headquarters",
          title: "본사",
          category: "본사" as const,
          rows: [],
          totals,
        },
      ];

  const loadRows = useCallback(async (nextStartDate: string, nextEndDate: string) => {
    if (isLoadingRef.current) {
      queuedRangeRef.current = [nextStartDate, nextEndDate];
      return;
    }

    isLoadingRef.current = true;

    try {
      const response = await fetch(
        `/api/settlement-profit?startDate=${nextStartDate}&endDate=${nextEndDate}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        throw new Error(error.message ?? "본사/총판 수익 조회에 실패했습니다.");
      }

      const data = (await response.json()) as SettlementProfitResponse;
      setDomainName(data.domainName);
      setProfitSections(data.sections ?? []);
      setTotals(data.totals);
      setMessage("서버 API 기준 데이터입니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "조회에 실패했습니다.");
    } finally {
      isLoadingRef.current = false;
      const queuedRange = queuedRangeRef.current;
      queuedRangeRef.current = null;

      if (queuedRange) {
        void loadRowsRef.current(...queuedRange);
      }
    }
  }, []);

  useEffect(() => {
    loadRowsRef.current = loadRows;
  }, [loadRows]);

  useEffect(() => {
    function refreshCurrentRange() {
      void loadRows(startDate, endDate);
    }

    function handleRequestSnapshot(event: Event) {
      const snapshot = (event as CustomEvent<RequestNotificationSnapshot>).detail;
      const signature = [
        ...snapshot.pendingIds.charges.map((id) => `charge:${id}`),
        ...snapshot.pendingIds.domainExchanges.map((id) => `exchange:${id}`),
      ]
        .sort()
        .join("|");

      if (pendingSignatureRef.current === null) {
        pendingSignatureRef.current = signature;
        return;
      }

      if (pendingSignatureRef.current !== signature) {
        pendingSignatureRef.current = signature;
        refreshCurrentRange();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshCurrentRange();
      }
    }

    window.addEventListener(dashboardSummaryRefreshEventName, refreshCurrentRange);
    window.addEventListener(requestNotificationSnapshotEventName, handleRequestSnapshot);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener(dashboardSummaryRefreshEventName, refreshCurrentRange);
      window.removeEventListener(requestNotificationSnapshotEventName, handleRequestSnapshot);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [endDate, loadRows, startDate]);

  function applyDateRange() {
    const nextStartDate = clampDate(startDate, MIN_QUERY_DATE, todayIsoDate);
    const nextEndDate = clampDate(endDate, nextStartDate, todayIsoDate);

    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    void loadRows(nextStartDate, nextEndDate);
  }

  return (
    <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(18,18,18,0.95)_0%,_rgba(14,14,16,0.98)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-6">
      <div className="flex flex-col gap-4 border-b border-white/8 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
            Headquarters / Distributor Profit
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            본사/총판 수익
          </h2>
          <p className="mt-2 text-sm text-white/45">
            {companyName} / {domainName} 승인 완료 데이터 기준입니다. {message}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block">
            <span className="mb-1 block text-xs text-white/38">시작일</span>
            <input
              type="date"
              value={startDate}
              min={MIN_QUERY_DATE}
              max={endDate}
              onChange={(event) =>
                setStartDate(clampDate(event.target.value, MIN_QUERY_DATE, endDate))
              }
              className="h-10 w-36 border-b border-white/42 bg-transparent text-white outline-none [color-scheme:dark]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-white/38">종료일</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayIsoDate}
              onChange={(event) =>
                setEndDate(clampDate(event.target.value, startDate, todayIsoDate))
              }
              className="h-10 w-36 border-b border-white/42 bg-transparent text-white outline-none [color-scheme:dark]"
            />
          </label>
          <button
            type="button"
            onClick={applyDateRange}
            className="h-10 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white transition hover:bg-blue-600"
          >
            조회
          </button>
        </div>
      </div>

      <div className="space-y-8 pt-6">
        {visibleSections.map((section) => {
          const displayRows = fillRowsByDate(section.rows, startDate, endDate);

          return (
            <article key={section.id}>
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <h3 className="text-xl font-semibold tracking-[-0.04em] text-white">
                  {section.title}
                </h3>
                <span className="text-sm font-semibold text-cyan-200/70">
                  {section.category}
                </span>
              </div>
              <div className="space-y-2 md:hidden">
                {displayRows.map((row) => (
                  <div
                    key={`mobile-${section.id}-${row.date}`}
                    className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                  >
                    <p className="text-sm font-semibold text-cyan-100">
                      {fromIsoDate(`2026-${row.date}`)}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      {[
                        ["충전", row.chargeTotal],
                        ["수수료", row.feeTotal],
                        ["환전(도메인)", row.payoutTotal],
                      ].map(([label, value]) => (
                        <div
                          key={`${section.id}-${row.date}-${label}`}
                          className="rounded-xl bg-black/20 px-3 py-2.5"
                        >
                          <dt className="text-xs text-white/42">{label}</dt>
                          <dd className="mt-1 break-all font-semibold text-white/90">
                            {formatKoreanWon(Number(value))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.07] p-4">
                  <p className="text-sm font-semibold text-cyan-100">합계</p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    {[
                      ["충전", section.totals.chargeTotal],
                      ["수수료", section.totals.feeTotal],
                      ["환전(도메인)", section.totals.payoutTotal],
                    ].map(([label, value]) => (
                      <div key={`${section.id}-total-${label}`}>
                        <dt className="text-xs text-white/42">{label}</dt>
                        <dd className="mt-1 break-all font-semibold text-white">
                          {formatKoreanWon(Number(value))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
              <div className="hidden overflow-hidden border border-white/16 bg-black/10 md:block">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead className="bg-black/18 text-white">
                      <tr>
                        {["날짜", "충전", "수수료", "환전(도메인)"].map((head) => (
                          <th
                            key={head}
                            className="border border-white/30 px-4 py-2 text-center font-semibold"
                          >
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.length ? (
                        displayRows.map((row) => (
                          <tr key={`${section.id}-${row.date}`} className="text-white/90">
                            <td className="border border-white/30 px-4 py-2 text-center">
                              {fromIsoDate(`2026-${row.date}`)}
                            </td>
                            <td className="border border-white/30 px-4 py-2 text-right">
                              {formatKoreanWon(row.chargeTotal)}
                            </td>
                            <td className="border border-white/30 px-4 py-2 text-right">
                              {formatKoreanWon(row.feeTotal)}
                            </td>
                            <td className="border border-white/30 px-4 py-2 text-right">
                              {formatKoreanWon(row.payoutTotal)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="border border-white/30 px-4 py-10 text-center text-sm text-white/42"
                          >
                            선택한 기간에 승인된 정산 데이터가 없습니다.
                          </td>
                        </tr>
                      )}
                      <tr className="bg-white/[0.12] font-semibold text-white">
                        <td className="border border-white/30 px-4 py-2 text-center">
                          합계
                        </td>
                        <td className="border border-white/30 px-4 py-2 text-right">
                          {formatKoreanWon(section.totals.chargeTotal)}
                        </td>
                        <td className="border border-white/30 px-4 py-2 text-right">
                          {formatKoreanWon(section.totals.feeTotal)}
                        </td>
                        <td className="border border-white/30 px-4 py-2 text-right">
                          {formatKoreanWon(section.totals.payoutTotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

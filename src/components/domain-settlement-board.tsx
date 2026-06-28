"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatKoreanWon } from "@/lib/charge-utils";
import {
  requestNotificationSnapshotEventName,
  type RequestNotificationSnapshot,
} from "@/components/global-request-notifier";

type DomainSettlementBoardProps = {
  initialFeeRate: number;
  domainName: string;
  initialRows: DomainSettlementRow[];
};

type DomainSettlementRow = {
  date: string;
  domainName: string;
  charge: number;
  exchange: number;
  company: number;
  topDistributor: number;
  distributor: number;
};

type DomainSettlementResponse = {
  domainName: string;
  rows: DomainSettlementRow[];
  total: {
    charge: number;
    exchange: number;
    company: number;
    topDistributor: number;
    distributor: number;
  };
};

const MIN_QUERY_DATE = "2026-01-01";
const dashboardSummaryRefreshEventName = "dashboard-summary-refresh";

type DomainSettlementGroup = {
  domainName: string;
  rows: DomainSettlementRow[];
  total: {
    charge: number;
    exchange: number;
    company: number;
    topDistributor: number;
    distributor: number;
  };
};

function getTodayIsoDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function getYesterdayIsoDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const now = new Date();
  const yesterday = new Date(now);

  yesterday.setDate(now.getDate() - 1);

  return formatter.format(yesterday);
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

function toDisplayDate(isoDate: string) {
  return isoDate.slice(5);
}

function formatSettlementValue(value: number, dashWhenZero = false) {
  if (dashWhenZero && value === 0) {
    return "-";
  }

  return formatKoreanWon(value);
}

function buildSettlementGroups(rows: DomainSettlementRow[]) {
  const groups = new Map<string, DomainSettlementGroup>();

  for (const row of rows) {
    const domainName = row.domainName || "-";
    const group =
      groups.get(domainName) ??
      ({
        domainName,
        rows: [],
        total: {
          charge: 0,
          exchange: 0,
          company: 0,
          topDistributor: 0,
          distributor: 0,
        },
      } satisfies DomainSettlementGroup);

    group.rows.push(row);
    group.total.charge += row.charge;
    group.total.exchange += row.exchange;
    group.total.company += row.company;
    group.total.topDistributor += row.topDistributor;
    group.total.distributor += row.distributor;
    groups.set(domainName, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: group.rows.sort((left, right) => left.date.localeCompare(right.date)),
    }))
    .sort((left, right) => left.domainName.localeCompare(right.domainName, "ko"));
}

export function DomainSettlementBoard({
  initialRows,
}: DomainSettlementBoardProps) {
  const todayIsoDate = getTodayIsoDate();
  const yesterdayIsoDate = getYesterdayIsoDate();
  const [startDate, setStartDate] = useState(yesterdayIsoDate);
  const [endDate, setEndDate] = useState(todayIsoDate);
  const [rows, setRows] = useState<DomainSettlementRow[]>(initialRows);
  const [message, setMessage] = useState("서버 API에서 도메인 정산 데이터를 불러옵니다.");
  const isLoadingRef = useRef(false);
  const queuedRangeRef = useRef<[string, string] | null>(null);
  const loadRowsRef = useRef<(startDate: string, endDate: string) => Promise<void>>(
    async () => undefined,
  );
  const pendingSignatureRef = useRef<string | null>(null);
  const settlementGroups = useMemo(() => buildSettlementGroups(rows), [rows]);
  const loadRows = useCallback(async (nextStartDate: string, nextEndDate: string) => {
    if (isLoadingRef.current) {
      queuedRangeRef.current = [nextStartDate, nextEndDate];
      return;
    }

    isLoadingRef.current = true;

    try {
      const response = await fetch(
        `/api/domain-settlement?startDate=${nextStartDate}&endDate=${nextEndDate}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        throw new Error(error.message ?? "도메인 정산 조회에 실패했습니다.");
      }

      const data = (await response.json()) as DomainSettlementResponse;
      setRows(data.rows);
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
    <div className="space-y-6">
      <section className="border-b border-white/10 pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs text-white/38">정산</p>
            <h2 className="mt-2 text-xl font-semibold text-white">도메인 정산</h2>
            <p className="mt-2 text-sm text-white/46">
              업체별 정산 내역을 분리해서 표시합니다. {message}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block">
              <span className="mb-2 block text-xs text-white/38">시작일</span>
              <input
                type="date"
                value={startDate}
                min={MIN_QUERY_DATE}
                max={endDate}
                onChange={(event) => {
                  const nextStartDate = clampDate(
                    event.target.value,
                    MIN_QUERY_DATE,
                    endDate,
                  );

                  setStartDate(nextStartDate);
                }}
                className="h-10 w-40 border border-white/10 bg-black/20 px-3 text-sm text-white outline-none [color-scheme:dark]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs text-white/38">종료일</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={todayIsoDate}
                onChange={(event) => {
                  const nextEndDate = clampDate(
                    event.target.value,
                    startDate,
                    todayIsoDate,
                  );

                  setEndDate(nextEndDate);
                }}
                className="h-10 w-40 border border-white/10 bg-black/20 px-3 text-sm text-white outline-none [color-scheme:dark]"
              />
            </label>
            <button
              type="button"
              onClick={applyDateRange}
              className="h-10 bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              조회
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-8">
        {settlementGroups.length ? (
          settlementGroups.map((group) => (
            <div key={group.domainName} className="space-y-2">
              <div className="flex items-end justify-between gap-3">
                <h3 className="text-base font-semibold text-white">
                  {group.domainName}
                </h3>
                <p className="text-xs text-white/44">{group.rows.length}건</p>
              </div>

              <div className="space-y-2 md:hidden">
                {group.rows.map((row, rowIndex) => (
                  <div
                    key={`mobile-${group.domainName}-${row.date}-${rowIndex}`}
                    className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                  >
                    <p className="text-sm font-semibold text-cyan-100">
                      {toDisplayDate(row.date)}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      {[
                        ["충전", formatSettlementValue(row.charge)],
                        [
                          "수수료",
                          formatSettlementValue(
                            row.company + row.topDistributor + row.distributor,
                          ),
                        ],
                        ["환전(도메인)", formatSettlementValue(row.exchange)],
                        ["상위총판", formatSettlementValue(row.topDistributor)],
                        ["총판", formatSettlementValue(row.distributor, true)],
                      ].map(([label, value]) => (
                        <div
                          key={`${group.domainName}-${row.date}-${label}`}
                          className="rounded-xl bg-black/20 px-3 py-2.5"
                        >
                          <dt className="text-xs text-white/42">{label}</dt>
                          <dd className="mt-1 break-all font-semibold text-white/90">
                            {value}
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
                      ["충전", formatSettlementValue(group.total.charge)],
                      [
                        "수수료",
                        formatSettlementValue(
                          group.total.company +
                            group.total.topDistributor +
                            group.total.distributor,
                        ),
                      ],
                      ["환전(도메인)", formatSettlementValue(group.total.exchange)],
                      ["상위총판", formatSettlementValue(group.total.topDistributor)],
                      ["총판", formatSettlementValue(group.total.distributor)],
                    ].map(([label, value]) => (
                      <div key={`${group.domainName}-total-${label}`}>
                        <dt className="text-xs text-white/42">{label}</dt>
                        <dd className="mt-1 break-all font-semibold text-white">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>

              <div className="hidden overflow-hidden border border-white/40 md:block">
                <div className="overflow-x-auto">
                  <table className="min-w-full table-fixed text-sm">
                    <thead>
                      <tr className="border-b border-white/40 text-white">
                        <th className="w-[16%] border-r border-white/40 px-3 py-1.5 text-center font-semibold">
                          날짜
                        </th>
                        <th className="w-[16%] border-r border-white/40 px-3 py-1.5 text-center font-semibold">
                          충전
                        </th>
                        <th className="w-[16%] border-r border-white/40 px-3 py-1.5 text-center font-semibold">
                          수수료
                        </th>
                        <th className="w-[16%] border-r border-white/40 px-3 py-1.5 text-center font-semibold">
                          환전(도메인)
                        </th>
                        <th className="w-[18%] border-r border-white/40 px-3 py-1.5 text-center font-semibold">
                          상위총판
                        </th>
                        <th className="w-[18%] px-3 py-1.5 text-center font-semibold">
                          총판
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, rowIndex) => (
                        <tr
                          key={`${group.domainName}-${row.date}-${rowIndex}`}
                          className="border-b border-white/30 text-white/90"
                        >
                          <td className="border-r border-white/30 px-3 py-1.5 text-center">
                            {toDisplayDate(row.date)}
                          </td>
                          <td className="border-r border-white/30 px-3 py-1.5 text-right">
                            {formatSettlementValue(row.charge)}
                          </td>
                          <td className="border-r border-white/30 px-3 py-1.5 text-right">
                            {formatSettlementValue(
                              row.company + row.topDistributor + row.distributor,
                            )}
                          </td>
                          <td className="border-r border-white/30 px-3 py-1.5 text-right">
                            {formatSettlementValue(row.exchange)}
                          </td>
                          <td className="border-r border-white/30 px-3 py-1.5 text-right">
                            {formatSettlementValue(row.topDistributor)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {formatSettlementValue(row.distributor, true)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-white/10 font-semibold text-white">
                        <td className="border-r border-white/30 px-3 py-1.5 text-center">
                          합계
                        </td>
                        <td className="border-r border-white/30 px-3 py-1.5 text-right">
                          {formatSettlementValue(group.total.charge)}
                        </td>
                        <td className="border-r border-white/30 px-3 py-1.5 text-right">
                          {formatSettlementValue(
                            group.total.company +
                              group.total.topDistributor +
                              group.total.distributor,
                          )}
                        </td>
                        <td className="border-r border-white/30 px-3 py-1.5 text-right">
                          {formatSettlementValue(group.total.exchange)}
                        </td>
                        <td className="border-r border-white/30 px-3 py-1.5 text-right">
                          {formatSettlementValue(group.total.topDistributor)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {formatSettlementValue(group.total.distributor)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="border border-white/12 px-4 py-12 text-center text-sm text-white/44">
            조회된 도메인 정산 내역이 없습니다.
          </div>
        )}
      </section>
    </div>
  );
}

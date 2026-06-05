"use client";

import { useMemo, useState } from "react";

import { formatKoreanWon } from "@/lib/charge-utils";

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

const PAGE_SIZE = 10;
const MIN_QUERY_DATE = "2026-01-01";

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

export function DomainSettlementBoard({
  domainName,
  initialRows,
}: DomainSettlementBoardProps) {
  const todayIsoDate = getTodayIsoDate();
  const yesterdayIsoDate = getYesterdayIsoDate();
  const [startDate, setStartDate] = useState(yesterdayIsoDate);
  const [endDate, setEndDate] = useState(todayIsoDate);
  const [currentPage, setCurrentPage] = useState(1);
  const [rows, setRows] = useState<DomainSettlementRow[]>(initialRows);
  const [message, setMessage] = useState("서버 API에서 도메인 정산 데이터를 불러옵니다.");
  const total = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          charge: sum.charge + row.charge,
          exchange: sum.exchange + row.exchange,
          company: sum.company + row.company,
          topDistributor: sum.topDistributor + row.topDistributor,
          distributor: sum.distributor + row.distributor,
        }),
        {
          charge: 0,
          exchange: 0,
          company: 0,
          topDistributor: 0,
          distributor: 0,
        },
      ),
    [rows],
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  async function loadRows(nextStartDate: string, nextEndDate: string) {
    try {
      const response = await fetch(
        `/api/domain-settlement?startDate=${nextStartDate}&endDate=${nextEndDate}`,
      );

      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        throw new Error(error.message ?? "도메인 정산 조회에 실패했습니다.");
      }

      const data = (await response.json()) as DomainSettlementResponse;
      setRows(data.rows);
      setMessage("서버 API 기준 데이터입니다.");
    } catch (error) {
      setRows([]);
      setMessage(error instanceof Error ? error.message : "조회에 실패했습니다.");
    }
  }

  function applyDateRange() {
    const nextStartDate = clampDate(startDate, MIN_QUERY_DATE, todayIsoDate);
    const nextEndDate = clampDate(endDate, nextStartDate, todayIsoDate);

    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    setCurrentPage(1);
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
              {domainName} · {message}
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

      <section className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <h3 className="text-base font-semibold text-white">{domainName}</h3>
          <p className="text-xs text-white/44">
            {rows.length}개 중 {(currentPage - 1) * PAGE_SIZE + 1}-
            {Math.min(currentPage * PAGE_SIZE, rows.length)}
          </p>
        </div>

        <div className="overflow-hidden border border-white/40">
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-white/40 text-white">
                  <th className="w-[14%] border-r border-white/40 px-3 py-1.5 text-center font-semibold">
                    날짜
                  </th>
                  <th className="w-[18%] border-r border-white/40 px-3 py-1.5 text-center font-semibold">
                    도메인
                  </th>
                  <th className="w-[14%] border-r border-white/40 px-3 py-1.5 text-center font-semibold">
                    충전
                  </th>
                  <th className="w-[14%] border-r border-white/40 px-3 py-1.5 text-center font-semibold">
                    수수료
                  </th>
                  <th className="w-[14%] border-r border-white/40 px-3 py-1.5 text-center font-semibold">
                    환전(도메인)
                  </th>
                  <th className="w-[13%] border-r border-white/40 px-3 py-1.5 text-center font-semibold">
                    상위총판
                  </th>
                  <th className="w-[13%] px-3 py-1.5 text-center font-semibold">
                    총판
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={`${domainName}-${row.domainName}-${row.date}`}
                    className="border-b border-white/30 text-white/90"
                  >
                    <td className="border-r border-white/30 px-3 py-1.5 text-center">
                      {toDisplayDate(row.date)}
                    </td>
                    <td className="border-r border-white/30 px-3 py-1.5 text-center">
                      {row.domainName}
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
                  <td className="border-r border-white/30 px-3 py-1.5 text-center">
                    전체
                  </td>
                  <td className="border-r border-white/30 px-3 py-1.5 text-right">
                    {formatSettlementValue(total.charge)}
                  </td>
                  <td className="border-r border-white/30 px-3 py-1.5 text-right">
                    {formatSettlementValue(
                      total.company + total.topDistributor + total.distributor,
                    )}
                  </td>
                  <td className="border-r border-white/30 px-3 py-1.5 text-right">
                    {formatSettlementValue(total.exchange)}
                  </td>
                  <td className="border-r border-white/30 px-3 py-1.5 text-right">
                    {formatSettlementValue(total.topDistributor)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {formatSettlementValue(total.distributor)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 ? (
          <div className="flex justify-center gap-2 pt-3">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`h-8 min-w-8 border border-white/20 px-3 text-sm ${
                    page === currentPage
                      ? "bg-white text-black"
                      : "bg-black/20 text-white hover:bg-white/10"
                  }`}
                >
                  {page}
                </button>
              ),
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

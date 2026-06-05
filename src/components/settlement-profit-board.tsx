"use client";

import { useState } from "react";

import { formatKoreanWon } from "@/lib/charge-utils";

type SettlementProfitBoardProps = {
  companyName: string;
  initialDomainName: string;
  initialRows: DailyProfitRow[];
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

type SettlementProfitResponse = {
  domainName: string;
  rows: DailyProfitRow[];
  totals: {
    chargeTotal: number;
    feeTotal: number;
    companyFeeTotal: number;
    distributorFeeTotal: number;
    payoutTotal: number;
  };
};

const MIN_QUERY_DATE = "2026-01-01";
const rowsPerPage = 10;

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
  initialTotals,
}: SettlementProfitBoardProps) {
  const todayIsoDate = getTodayIsoDate();
  const monthStartIsoDate = getMonthStartIsoDate();
  const [startDate, setStartDate] = useState(monthStartIsoDate);
  const [endDate, setEndDate] = useState(todayIsoDate);
  const [domainName, setDomainName] = useState(initialDomainName);
  const [profitRows, setProfitRows] = useState<DailyProfitRow[]>(initialRows);
  const [totals, setTotals] = useState(initialTotals);
  const [message, setMessage] = useState("서버 API 기준 데이터입니다.");
  const [page, setPage] = useState(1);
  const displayRows = fillRowsByDate(profitRows, startDate, endDate);
  const pageCount = Math.max(1, Math.ceil(displayRows.length / rowsPerPage));
  const visibleRows = displayRows.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  async function loadRows(nextStartDate: string, nextEndDate: string) {
    try {
      const response = await fetch(
        `/api/settlement-profit?startDate=${nextStartDate}&endDate=${nextEndDate}`,
      );

      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        throw new Error(error.message ?? "본사/총판 수익 조회에 실패했습니다.");
      }

      const data = (await response.json()) as SettlementProfitResponse;
      setDomainName(data.domainName);
      setProfitRows(data.rows);
      setTotals(data.totals);
      setPage(1);
      setMessage("서버 API 기준 데이터입니다.");
    } catch (error) {
      setProfitRows([]);
      setTotals({
        chargeTotal: 0,
        feeTotal: 0,
        companyFeeTotal: 0,
        distributorFeeTotal: 0,
        payoutTotal: 0,
      });
      setPage(1);
      setMessage(error instanceof Error ? error.message : "조회에 실패했습니다.");
    }
  }

  function applyDateRange() {
    const nextStartDate = clampDate(startDate, MIN_QUERY_DATE, todayIsoDate);
    const nextEndDate = clampDate(endDate, nextStartDate, todayIsoDate);

    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    setPage(1);
    void loadRows(nextStartDate, nextEndDate);
  }

  return (
    <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(18,18,18,0.95)_0%,_rgba(14,14,16,0.98)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-6">
      <div className="flex flex-col gap-4 border-b border-white/8 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
            Daily Profit
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            일별 수익
          </h2>
          <p className="mt-2 text-sm text-white/45">
            {companyName} / {domainName} 승인 완료 데이터 기준입니다. {message}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block">
              <span className="mb-1 block text-xs text-white/38">
                시작일
              </span>
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
              <span className="mb-1 block text-xs text-white/38">
                종료일
              </span>
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
        <article>
          <h3 className="mb-3 text-xl font-semibold tracking-[-0.04em] text-white">
            {domainName}
          </h3>
          <div className="overflow-hidden border border-white/16 bg-black/10">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-black/18 text-white">
                <tr>
                  {["날짜", "충전", "수수료", "본사", "총판", "환전(도메인)"].map((head) => (
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
                  visibleRows.map((row) => (
                    <tr
                      key={`${domainName}-${row.date}`}
                      className="text-white/90"
                    >
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
                        {formatKoreanWon(row.companyFeeTotal)}
                      </td>
                      <td className="border border-white/30 px-4 py-2 text-right">
                        {formatKoreanWon(row.distributorFeeTotal)}
                      </td>
                      <td className="border border-white/30 px-4 py-2 text-right">
                        {formatKoreanWon(row.payoutTotal)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="border border-white/30 px-4 py-10 text-center text-sm text-white/42"
                    >
                      선택한 기간에 승인된 정산 데이터가 없습니다.
                    </td>
                  </tr>
                )}
                <tr className="bg-white/[0.12] font-semibold text-white">
                  <td className="border border-white/30 px-4 py-2 text-center">합계</td>
                  <td className="border border-white/30 px-4 py-2 text-right">
                    {formatKoreanWon(totals.chargeTotal)}
                  </td>
                  <td className="border border-white/30 px-4 py-2 text-right">
                    {formatKoreanWon(totals.feeTotal)}
                  </td>
                  <td className="border border-white/30 px-4 py-2 text-right">
                    {formatKoreanWon(totals.companyFeeTotal)}
                  </td>
                  <td className="border border-white/30 px-4 py-2 text-right">
                    {formatKoreanWon(totals.distributorFeeTotal)}
                  </td>
                  <td className="border border-white/30 px-4 py-2 text-right">
                    {formatKoreanWon(totals.payoutTotal)}
                  </td>
                </tr>
              </tbody>
            </table>

            {displayRows.length > rowsPerPage ? (
              <div className="flex items-center justify-center gap-2 border-x border-b border-white/30 px-4 py-5">
                {Array.from({ length: pageCount }, (_, index) => index + 1).map(
                  (pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setPage(pageNumber)}
                      className={`h-10 min-w-10 rounded-xl px-3 text-lg font-semibold ${
                        page === pageNumber
                          ? "bg-white text-slate-950"
                          : "bg-black text-white"
                      }`}
                    >
                      {pageNumber}
                    </button>
                  ),
                )}
              </div>
            ) : null}
          </div>
          </div>
        </article>
      </div>
    </section>
  );
}

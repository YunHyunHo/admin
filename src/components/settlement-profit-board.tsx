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
    payoutTotal: number;
  };
};

type DailyProfitRow = {
  date: string;
  chargeTotal: number;
  feeTotal: number;
  payoutTotal: number;
};

type SettlementProfitResponse = {
  domainName: string;
  rows: DailyProfitRow[];
  totals: {
    chargeTotal: number;
    feeTotal: number;
    payoutTotal: number;
  };
};

const MIN_QUERY_DATE = "2026-01-01";

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

export function SettlementProfitBoard({
  companyName,
  initialDomainName,
  initialRows,
  initialTotals,
}: SettlementProfitBoardProps) {
  const todayIsoDate = getTodayIsoDate();
  const yesterdayIsoDate = getYesterdayIsoDate();
  const [startDate, setStartDate] = useState(yesterdayIsoDate);
  const [endDate, setEndDate] = useState(todayIsoDate);
  const [domainName, setDomainName] = useState(initialDomainName);
  const [profitRows, setProfitRows] = useState<DailyProfitRow[]>(initialRows);
  const [totals, setTotals] = useState(initialTotals);
  const [message, setMessage] = useState("서버 API에서 수익 데이터를 불러옵니다.");

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
      setMessage("서버 API 기준 데이터입니다.");
    } catch (error) {
      setProfitRows([]);
      setTotals({ chargeTotal: 0, feeTotal: 0, payoutTotal: 0 });
      setMessage(error instanceof Error ? error.message : "조회에 실패했습니다.");
    }
  }

  function applyDateRange() {
    const nextStartDate = clampDate(startDate, MIN_QUERY_DATE, todayIsoDate);
    const nextEndDate = clampDate(endDate, nextStartDate, todayIsoDate);

    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    void loadRows(nextStartDate, nextEndDate);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
              Settlement Profit
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              본사/총판 수익
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/56">
              {companyName} 업체의 승인 완료 건만 기준으로 날짜별 충전액, 수수료,
              도메인 정산 금액을 확인하는 화면이야. {message}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/38">
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
                className="h-11 w-40 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none [color-scheme:dark]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/38">
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
                className="h-11 w-40 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none [color-scheme:dark]"
              />
            </label>
            <button
              type="button"
              onClick={applyDateRange}
              className="h-11 rounded-2xl bg-cyan-500 px-5 text-sm font-semibold text-slate-950"
            >
              조회
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-white/38">
              대상 도메인
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">{domainName}</p>
          </article>
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-white/38">
              충전 합계
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {formatKoreanWon(totals.chargeTotal)}
            </p>
          </article>
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-white/38">
              수수료 합계
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {formatKoreanWon(totals.feeTotal)}
            </p>
          </article>
          <article className="rounded-2xl border border-cyan-400/16 bg-cyan-500/8 px-5 py-4">
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-cyan-100/48">
              도메인 정산금
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {formatKoreanWon(totals.payoutTotal)}
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-6">
        <div className="overflow-hidden rounded-2xl border border-white/8">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-black/30 text-white/58">
                <tr>
                  {["날짜", "충전", "수수료", "환전(도메인)"].map((head) => (
                    <th
                      key={head}
                      className="border-b border-white/8 px-4 py-3 text-center font-medium"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profitRows.length ? (
                  profitRows.map((row) => (
                    <tr
                      key={`${domainName}-${row.date}`}
                      className="border-t border-white/8 text-white/84"
                    >
                      <td className="px-4 py-4 text-center">
                        {fromIsoDate(`2026-${row.date}`)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {formatKoreanWon(row.chargeTotal)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {formatKoreanWon(row.feeTotal)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {formatKoreanWon(row.payoutTotal)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-sm text-white/42"
                    >
                      선택한 기간에 승인된 정산 데이터가 없습니다.
                    </td>
                  </tr>
                )}
                <tr className="border-t border-white/8 bg-white/[0.03] font-semibold text-white">
                  <td className="px-4 py-4 text-center">합계</td>
                  <td className="px-4 py-4 text-right">
                    {formatKoreanWon(totals.chargeTotal)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {formatKoreanWon(totals.feeTotal)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {formatKoreanWon(totals.payoutTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

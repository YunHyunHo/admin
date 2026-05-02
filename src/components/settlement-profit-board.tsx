"use client";

import { useMemo, useState } from "react";

import {
  approvedRequests,
  formatKoreanWon,
  getDomainNameByCompany,
  getFeeRateByCompany,
  parseKoreanWon,
  type ProcessedRequest,
} from "@/lib/mock-charge-data";

type SettlementProfitBoardProps = {
  companyName: string;
};

type DailyProfitRow = {
  date: string;
  chargeTotal: number;
  feeTotal: number;
  payoutTotal: number;
};

const DISPLAY_YEAR = "2026";
const MIN_QUERY_DATE = "2026-01-01";

function toIsoDate(mmdd: string) {
  const [month, day] = mmdd.split("-");
  return `${DISPLAY_YEAR}-${month}-${day}`;
}

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

function getMonthStartIsoDate(isoDate: string) {
  return `${isoDate.slice(0, 8)}01`;
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

function buildProfitRows(
  requests: ProcessedRequest[],
  feeRate: number,
): DailyProfitRow[] {
  const grouped = new Map<string, DailyProfitRow>();

  for (const request of requests) {
    const date = request.completedAt.slice(0, 5);
    const amount = parseKoreanWon(request.amount);
    const fee = Math.floor(amount * (feeRate / 100));
    const payout = amount - fee;
    const current = grouped.get(date) ?? {
      date,
      chargeTotal: 0,
      feeTotal: 0,
      payoutTotal: 0,
    };

    current.chargeTotal += amount;
    current.feeTotal += fee;
    current.payoutTotal += payout;
    grouped.set(date, current);
  }

  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function SettlementProfitBoard({
  companyName,
}: SettlementProfitBoardProps) {
  const domainName = getDomainNameByCompany(companyName);
  const feeRate = getFeeRateByCompany(companyName);
  const companyRequests = useMemo(
    () => approvedRequests.filter((request) => request.domain === domainName),
    [domainName],
  );

  const todayIsoDate = getTodayIsoDate();
  const monthStartIsoDate = getMonthStartIsoDate(todayIsoDate);

  const [startDate, setStartDate] = useState(monthStartIsoDate);
  const [endDate, setEndDate] = useState(todayIsoDate);
  const [appliedRange, setAppliedRange] = useState({
    startDate: monthStartIsoDate,
    endDate: todayIsoDate,
  });

  function applyDateRange() {
    const nextStartDate = clampDate(startDate, MIN_QUERY_DATE, todayIsoDate);
    const nextEndDate = clampDate(endDate, nextStartDate, todayIsoDate);

    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    setAppliedRange({ startDate: nextStartDate, endDate: nextEndDate });
  }

  const filteredRequests = useMemo(
    () =>
      companyRequests.filter((request) => {
        const date = toIsoDate(request.completedAt.slice(0, 5));
        return date >= appliedRange.startDate && date <= appliedRange.endDate;
      }),
    [companyRequests, appliedRange],
  );

  const profitRows = useMemo(
    () => buildProfitRows(filteredRequests, feeRate),
    [filteredRequests, feeRate],
  );

  const chargeTotal = profitRows.reduce((sum, row) => sum + row.chargeTotal, 0);
  const feeTotal = profitRows.reduce((sum, row) => sum + row.feeTotal, 0);
  const payoutTotal = profitRows.reduce((sum, row) => sum + row.payoutTotal, 0);

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
              도메인 정산 금액을 확인하는 화면이야.
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
                onChange={(event) => {
                  const nextStartDate = clampDate(
                    event.target.value,
                    MIN_QUERY_DATE,
                    endDate,
                  );

                  setStartDate(nextStartDate);
                }}
                min={MIN_QUERY_DATE}
                max={endDate}
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
                onChange={(event) => {
                  const nextEndDate = clampDate(
                    event.target.value,
                    startDate,
                    todayIsoDate,
                  );

                  setEndDate(nextEndDate);
                }}
                min={startDate}
                max={todayIsoDate}
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
            <p className="mt-3 text-2xl font-semibold text-white">
              {domainName}
            </p>
          </article>
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-white/38">
              충전 합계
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {formatKoreanWon(chargeTotal)}
            </p>
          </article>
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-white/38">
              수수료 합계
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {formatKoreanWon(feeTotal)}
            </p>
          </article>
          <article className="rounded-2xl border border-cyan-400/16 bg-cyan-500/8 px-5 py-4">
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-cyan-100/48">
              도메인 정산금
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {formatKoreanWon(payoutTotal)}
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
                        {fromIsoDate(toIsoDate(row.date))}
                      </td>
                      <td className="px-4 py-4 text-right">{formatKoreanWon(row.chargeTotal)}</td>
                      <td className="px-4 py-4 text-right">{formatKoreanWon(row.feeTotal)}</td>
                      <td className="px-4 py-4 text-right">{formatKoreanWon(row.payoutTotal)}</td>
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
                  <td className="px-4 py-4 text-right">{formatKoreanWon(chargeTotal)}</td>
                  <td className="px-4 py-4 text-right">{formatKoreanWon(feeTotal)}</td>
                  <td className="px-4 py-4 text-right">{formatKoreanWon(payoutTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

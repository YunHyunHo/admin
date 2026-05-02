"use client";

import { useState } from "react";

import { formatKoreanWon } from "@/lib/charge-utils";

type FeeRecordsBoardProps = {
  companyName: string;
  initialRows: FeeRecordRow[];
};

type FeeRecordRow = {
  id: string;
  branch: string;
  topAgent: string;
  subAgent: string;
  acquisitionBranch: string;
  domain: string;
  uid: string;
  amount: number;
  feeRate: number;
  fee: number;
  bankName: string;
  acquiredAt: string;
  requestedAt: string;
};

const MIN_QUERY_DATE = "2026-01-01";
const PAGE_SIZE = 10;

type FeeRecordsResponse = {
  rows: FeeRecordRow[];
  totals: {
    amount: number;
    fee: number;
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

function truncateId(id: string) {
  if (id.length <= 8) {
    return id;
  }

  return `${id.slice(0, 4)} ${id.slice(4, 8)}...`;
}

function formatRate(rate: number) {
  return `${rate}%`;
}

export function FeeRecordsBoard({
  companyName,
  initialRows,
}: FeeRecordsBoardProps) {
  const todayIsoDate = getTodayIsoDate();
  const yesterdayIsoDate = getYesterdayIsoDate();
  const [startDate, setStartDate] = useState(yesterdayIsoDate);
  const [endDate, setEndDate] = useState(todayIsoDate);
  const [currentPage, setCurrentPage] = useState(1);
  const [rows, setRows] = useState<FeeRecordRow[]>(initialRows);
  const [message, setMessage] = useState("서버 API에서 수수료 기록을 불러옵니다.");

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const totalFee = rows.reduce((sum, row) => sum + row.fee, 0);
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  async function loadRows(nextStartDate: string, nextEndDate: string) {
    try {
      const response = await fetch(
        `/api/fee-records?startDate=${nextStartDate}&endDate=${nextEndDate}`,
      );

      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        throw new Error(error.message ?? "수수료 기록 조회에 실패했습니다.");
      }

      const data = (await response.json()) as FeeRecordsResponse;
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

  function refreshRecords() {
    setStartDate(yesterdayIsoDate);
    setEndDate(todayIsoDate);
    setCurrentPage(1);
    void loadRows(yesterdayIsoDate, todayIsoDate);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
              Fee Records
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">수수료 기록</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/56">
              {companyName} 업체의 승인 완료 거래를 기준으로 거래액, 요율,
              수수료와 입금은행 정보를 기록하는 화면입니다. {message}
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
                onChange={(event) => {
                  const nextStartDate = clampDate(
                    event.target.value,
                    MIN_QUERY_DATE,
                    endDate,
                  );

                  setStartDate(nextStartDate);
                }}
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
                onChange={(event) => {
                  const nextEndDate = clampDate(
                    event.target.value,
                    startDate,
                    todayIsoDate,
                  );

                  setEndDate(nextEndDate);
                }}
                className="h-11 w-40 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none [color-scheme:dark]"
              />
            </label>
            <button
              type="button"
              onClick={applyDateRange}
              className="h-11 rounded-2xl bg-cyan-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              조회
            </button>
            <button
              type="button"
              onClick={refreshRecords}
              className="h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
            >
              새로고침
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-white/38">
              거래 건수
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {rows.length.toLocaleString("ko-KR")} 건
            </p>
          </article>
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-white/38">
              거래액 합계
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {formatKoreanWon(totalAmount)}
            </p>
          </article>
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-white/38">
              수수료 합계
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {formatKoreanWon(totalFee)}
            </p>
          </article>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-white/8 bg-black/18">
        <div className="overflow-x-auto">
          <table className="min-w-[1500px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-black/60 text-white">
                {[
                  "ID",
                  "본사",
                  "상위총판",
                  "총판",
                  "획득지점",
                  "업체(도메인)",
                  "거래유저/uid",
                  "거래액",
                  "요율",
                  "수수료",
                  "입금은행",
                  "획득일",
                  "거래요청일",
                ].map((head) => (
                  <th
                    key={head}
                    className="border border-white/16 px-4 py-4 text-center text-xs font-semibold text-white/86"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length > 0 ? (
                visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    className="bg-white/[0.035] text-white/86 transition hover:bg-cyan-400/[0.06]"
                  >
                    <td className="border border-white/14 px-4 py-4 text-center font-mono text-xs text-white/72">
                      {truncateId(row.id)}
                    </td>
                    <td className="border border-white/14 px-4 py-4 text-center">
                      {row.branch}
                    </td>
                    <td className="border border-white/14 px-4 py-4 text-center">
                      {row.topAgent}
                    </td>
                    <td className="border border-white/14 px-4 py-4 text-center">
                      {row.subAgent}
                    </td>
                    <td className="border border-white/14 px-4 py-4 text-center font-semibold">
                      {row.acquisitionBranch}
                    </td>
                    <td className="border border-white/14 px-4 py-4 text-center">
                      {row.domain}
                    </td>
                    <td className="border border-white/14 px-4 py-4 text-center">
                      /{row.uid}
                    </td>
                    <td className="border border-white/14 px-4 py-4 text-right">
                      {formatKoreanWon(row.amount)}
                    </td>
                    <td className="border border-white/14 px-4 py-4 text-center">
                      {formatRate(row.feeRate)}
                    </td>
                    <td className="border border-white/14 px-4 py-4 text-right font-semibold">
                      {formatKoreanWon(row.fee)}
                    </td>
                    <td className="border border-white/14 px-4 py-4 text-center">
                      {row.bankName}
                    </td>
                    <td className="border border-white/14 px-4 py-4 text-center">
                      {row.acquiredAt}
                    </td>
                    <td className="border border-white/14 px-4 py-4 text-center">
                      {row.requestedAt}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={13}
                    className="border border-white/14 px-4 py-14 text-center text-white/48"
                  >
                    선택한 기간에 수수료 기록이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center justify-center gap-2 border-t border-white/8 px-4 py-4">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`h-9 min-w-9 rounded-xl px-3 text-sm font-semibold transition ${
                    page === currentPage
                      ? "bg-white text-slate-950"
                      : "bg-white/[0.05] text-white/70 hover:bg-white/[0.09]"
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

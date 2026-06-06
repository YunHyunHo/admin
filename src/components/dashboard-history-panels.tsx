"use client";

import { useMemo, useState } from "react";

import { formatKoreanWon } from "@/lib/charge-utils";
import type { DashboardPartnerSummary } from "@/lib/dashboard-summary-repository";
import type { LedgerRow } from "@/lib/transaction-ledger-types";

const ROWS_PER_PAGE = 10;

const metricLabels = ["충전", "수수료", "환전", "보유"] as const;

function getPartnerTypeLabel(type: DashboardPartnerSummary["type"]) {
  switch (type) {
    case "TOP_DISTRIBUTOR":
      return "상위총판";
    case "DISTRIBUTOR":
      return "총판";
    default:
      return type;
  }
}

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

function PaginationControls({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 border-x border-b border-white/8 px-4 py-5">
      {Array.from({ length: pageCount }, (_, index) => index + 1).map(
        (pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onPageChange(pageNumber)}
            className={`h-10 min-w-10 rounded-xl px-3 text-lg font-semibold ${
              page === pageNumber ? "bg-white text-slate-950" : "bg-black text-white"
            }`}
          >
            {pageNumber}
          </button>
        ),
      )}
    </div>
  );
}

export function DashboardHistoryPanels({
  partnerSummaries,
  recentTransactions,
}: {
  partnerSummaries: DashboardPartnerSummary[];
  recentTransactions: LedgerRow[];
}) {
  const [partnerPage, setPartnerPage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);
  const [isSummaryOpen, setIsSummaryOpen] = useState(true);

  const partnerPageCount = Math.max(
    1,
    Math.ceil(partnerSummaries.length / ROWS_PER_PAGE),
  );
  const transactionPageCount = Math.max(
    1,
    Math.ceil(recentTransactions.length / ROWS_PER_PAGE),
  );

  const partnerPageRows = useMemo(
    () =>
      partnerSummaries.slice(
        (partnerPage - 1) * ROWS_PER_PAGE,
        partnerPage * ROWS_PER_PAGE,
      ),
    [partnerPage, partnerSummaries],
  );
  const transactionPageRows = useMemo(
    () =>
      recentTransactions.slice(
        (transactionPage - 1) * ROWS_PER_PAGE,
        transactionPage * ROWS_PER_PAGE,
      ),
    [recentTransactions, transactionPage],
  );
  const totals = useMemo(
    () => getSummaryTotals(partnerSummaries),
    [partnerSummaries],
  );
  const totalValues = [
    totals.chargeTotal,
    totals.feeTotal,
    totals.exchangeTotal,
    totals.balanceTotal,
  ];

  return (
    <>
      <section className="mt-5 overflow-hidden border border-white/10 bg-white/[0.025]">
        <div className="flex flex-col border-b border-white/10 bg-black/26 lg:flex-row">
          <div className="flex shrink-0 items-stretch border-b border-white/10 lg:border-b-0 lg:border-r">
            <button
              type="button"
              onClick={() => setIsSummaryOpen((current) => !current)}
              aria-expanded={isSummaryOpen}
              className="grid h-[72px] w-[4.5rem] place-items-center border-r border-white/10 text-2xl font-semibold text-white/88 transition hover:bg-white/[0.06]"
            >
              ☰
            </button>
            <button
              type="button"
              onClick={() => setIsSummaryOpen((current) => !current)}
              className="grid h-[72px] w-[5rem] place-items-center text-2xl font-semibold text-white/88 transition hover:bg-white/[0.06]"
              aria-label={isSummaryOpen ? "거래 요약 닫기" : "거래 요약 열기"}
            >
              {isSummaryOpen ? "⌃" : "⌄"}
            </button>
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-2 sm:grid-cols-4 lg:max-w-[760px]">
            {metricLabels.map((label, index) => (
              <div
                key={`summary-total-${label}`}
                className="min-h-[72px] border-r border-white/10 px-3 py-3 text-center last:border-r-0"
              >
                <p className="text-sm font-semibold text-white/70">{label}</p>
                <p className="mt-2 truncate text-base font-bold text-white">
                  {formatKoreanWon(totalValues[index])}
                </p>
              </div>
            ))}
          </div>
        </div>

        {isSummaryOpen ? (
          <div className="grid bg-[#242424] lg:grid-cols-2">
            {partnerSummaries.length ? (
              partnerSummaries.map((item) => (
                <div
                  key={`summary-grid-${item.id}`}
                  className="grid min-h-[60px] grid-cols-[minmax(7rem,1fr)_repeat(4,minmax(5.5rem,1fr))] border-b border-r border-black/60 text-center text-sm text-white"
                >
                  <div className="flex items-center justify-center border-r border-black/60 bg-white/[0.055] px-2 font-semibold">
                    <span className="line-clamp-2 break-keep">{item.name}</span>
                  </div>
                  {getMetricValues(item).map((value, index) => (
                    <div
                      key={`${item.id}-${metricLabels[index]}`}
                      className="grid grid-rows-2 border-r border-black/60 last:border-r-0"
                    >
                      <div className="flex items-center justify-center border-b border-black/60 bg-white/[0.045] px-2 font-semibold">
                        {metricLabels[index]}
                      </div>
                      <div className="flex min-w-0 items-center justify-center px-2 font-bold">
                        <span className="truncate">{formatKoreanWon(value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="px-4 py-10 text-center text-sm text-white/42 lg:col-span-2">
                표시할 하청/업체 현황이 없습니다.
              </div>
            )}
          </div>
        ) : null}
      </section>

      <div className="mt-5 hidden overflow-hidden rounded-2xl border border-white/8 xl:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-center text-sm">
            <thead className="bg-black/30 text-white/60">
              <tr>
                {["아이디", "구분", "이름", "충전", "수수료", "환전", "보유", "상태"].map(
                  (head) => (
                    <th
                      key={head}
                      className="border-b border-r border-white/8 px-4 py-3 font-medium last:border-r-0"
                    >
                      {head}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {partnerPageRows.length ? (
                partnerPageRows.map((item) => {
                  const isActive =
                    item.balanceTotal > 0 ||
                    item.chargeTotal > 0 ||
                    item.exchangeTotal > 0 ||
                    item.feeTotal > 0;

                  return (
                    <tr key={item.id} className="border-t border-white/8 text-white/88">
                      <td className="border-r border-white/8 px-4 py-4 text-left last:border-r-0">
                        <span className="block max-w-[140px] truncate font-medium text-cyan-100">
                          {item.loginId}
                        </span>
                      </td>
                      <td className="border-r border-white/8 px-4 py-4 last:border-r-0">
                        {getPartnerTypeLabel(item.type)}
                      </td>
                      <td className="border-r border-white/8 px-4 py-4 text-left font-semibold last:border-r-0">
                        <span className="block max-w-[220px] truncate">{item.name}</span>
                      </td>
                      <td className="border-r border-white/8 px-4 py-4 text-right last:border-r-0">
                        {formatKoreanWon(item.chargeTotal)}
                      </td>
                      <td className="border-r border-white/8 px-4 py-4 text-right last:border-r-0">
                        {formatKoreanWon(item.feeTotal)}
                      </td>
                      <td className="border-r border-white/8 px-4 py-4 text-right last:border-r-0">
                        {formatKoreanWon(item.exchangeTotal)}
                      </td>
                      <td className="border-r border-white/8 px-4 py-4 text-right font-semibold text-white last:border-r-0">
                        {formatKoreanWon(item.balanceTotal)}
                      </td>
                      <td className="px-4 py-4">
                        {isActive ? (
                          <span className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
                            운영중
                          </span>
                        ) : (
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">
                            대기
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-white/40">
                    표시할 하청/업체 현황이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={partnerPage}
          pageCount={partnerPageCount}
          onPageChange={setPartnerPage}
        />
      </div>

      <div className="mt-5 grid gap-3 xl:hidden lg:grid-cols-2">
        {partnerPageRows.length ? (
          partnerPageRows.map((item) => {
            return (
              <article
                key={item.id}
                className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035]"
              >
                <div className="border-b border-white/8 bg-white/[0.045] px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100">
                          {item.loginId}
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70">
                          {getPartnerTypeLabel(item.type)}
                        </span>
                      </div>
                      <h3 className="mt-3 truncate text-lg font-semibold text-white">
                        {item.name}
                      </h3>
                    </div>
                    {item.balanceTotal > 0 ? (
                      <span className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
                        운영중
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">
                        대기
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 divide-x divide-white/8">
                  {[
                    ["충전", formatKoreanWon(item.chargeTotal)],
                    ["수수료", formatKoreanWon(item.feeTotal)],
                    ["환전", formatKoreanWon(item.exchangeTotal)],
                    ["보유", formatKoreanWon(item.balanceTotal)],
                  ].map(([label, value]) => (
                    <div key={`${item.id}-${label}`} className="px-4 py-4 text-center">
                      <p className="text-xs font-medium tracking-[0.18em] text-white/40">
                        {label}
                      </p>
                      <p className="mt-3 text-lg font-semibold tracking-[-0.04em] text-white">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-10 text-center text-sm text-white/42 lg:col-span-2">
            표시할 하청/업체 현황이 없습니다.
          </div>
        )}
      </div>
      <div className="xl:hidden">
        <PaginationControls
          page={partnerPage}
          pageCount={partnerPageCount}
          onPageChange={setPartnerPage}
        />
      </div>

      <div className="mt-8">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
            Recent Transactions
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            최근 거래내역
          </h2>
          <p className="mt-2 text-sm text-white/45">
            내 직속 업체와 하위 총판 기준의 충전/환전 거래를 확인합니다.
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-white/8">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/30 text-white/58">
              <tr>
                {["구분", "상위총판", "총판", "업체", "입금자", "금액", "신청시간", "상태"].map(
                  (head) => (
                    <th key={head} className="border-b border-white/8 px-4 py-3 font-medium">
                      {head}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {transactionPageRows.length ? (
                transactionPageRows.map((row) => (
                  <tr key={row.id} className="border-t border-white/8 text-white/82">
                    <td className="px-4 py-4">{row.transactionType ?? "-"}</td>
                    <td className="px-4 py-4">{row.topDistributor}</td>
                    <td className="px-4 py-4">{row.distributor}</td>
                    <td className="px-4 py-4">{row.companyName ?? row.domain}</td>
                    <td className="px-4 py-4">{row.depositor}</td>
                    <td className="px-4 py-4 text-right">{formatKoreanWon(row.amount)}</td>
                    <td className="px-4 py-4">{row.requestedAt}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-medium text-white/88">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-white/40">
                    표시할 거래내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={transactionPage}
          pageCount={transactionPageCount}
          onPageChange={setTransactionPage}
        />
      </div>
    </>
  );
}

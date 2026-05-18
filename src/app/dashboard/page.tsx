import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { getSessionUser } from "@/lib/auth";
import { formatKoreanWon } from "@/lib/charge-utils";
import {
  getDashboardPartnerSummariesForUser,
  type DashboardPartnerSummary,
  getDashboardSummaryForUser,
} from "@/lib/dashboard-summary-repository";
import { getTransactionLedgerRows } from "@/lib/transaction-ledger-repository";

function sortPartnerSummaries(
  items: DashboardPartnerSummary[],
): DashboardPartnerSummary[] {
  return [...items].sort((left, right) => {
    const leftHasActivity = Number(
      left.balanceTotal > 0 ||
        left.chargeTotal > 0 ||
        left.exchangeTotal > 0 ||
        left.feeTotal > 0,
    );
    const rightHasActivity = Number(
      right.balanceTotal > 0 ||
        right.chargeTotal > 0 ||
        right.exchangeTotal > 0 ||
        right.feeTotal > 0,
    );

    return (
      rightHasActivity - leftHasActivity ||
      right.balanceTotal - left.balanceTotal ||
      right.chargeTotal - left.chargeTotal ||
      right.exchangeTotal - left.exchangeTotal ||
      right.feeTotal - left.feeTotal ||
      (left.type === right.type ? 0 : left.type === "DISTRIBUTOR" ? -1 : 1) ||
      left.name.localeCompare(right.name, "ko")
    );
  });
}

export default async function DashboardPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (user.role === "MASTER") {
    redirect("/dashboard/org/top-distributors");
  }

  const [summary, recentTransactions, partnerSummaries] = await Promise.all([
    getDashboardSummaryForUser(user),
    getTransactionLedgerRows([], user),
    getDashboardPartnerSummariesForUser(user),
  ]);
  const prioritizedPartnerSummaries = sortPartnerSummaries(partnerSummaries);

  const domainCount = prioritizedPartnerSummaries.filter(
    (item) => item.type === "DOMAIN",
  ).length;
  const subcontractCount = prioritizedPartnerSummaries.filter(
    (item) => item.type === "DISTRIBUTOR",
  ).length;
  const exchangeTotal = prioritizedPartnerSummaries.reduce(
    (sum, item) => sum + item.exchangeTotal,
    0,
  );
  const commissionTotal = prioritizedPartnerSummaries.reduce(
    (sum, item) => sum + item.feeTotal,
    0,
  );
  const balanceTotal = prioritizedPartnerSummaries.reduce(
    (sum, item) => sum + item.balanceTotal,
    0,
  );
  const summaryColumns = [
    { label: "총판", value: `${subcontractCount}` },
    { label: "업체", value: `${domainCount}` },
    { label: "대기", value: `${summary.pendingCount}` },
    { label: "승인", value: `${summary.approvedCount}` },
    { label: "거절", value: `${summary.rejectedCount}` },
    { label: "충전", value: formatKoreanWon(summary.approvedChargeTotal) },
    { label: "수수료", value: formatKoreanWon(commissionTotal) },
    { label: "환전", value: formatKoreanWon(exchangeTotal) },
    { label: "보유", value: formatKoreanWon(balanceTotal) },
  ];

  return (
    <AdminShell user={user} activeItem="dashboard-home" helperText="">
      <div className="space-y-5">
        <section className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
          <div className="border-b border-white/8 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
                  Dashboard
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
                  운영 요약
                </h2>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-white/60">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  로그인 {user.username}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  기준 업체 {user.companyName}
                </span>
                <span className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1.5 text-emerald-100">
                  상태 정상
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-center">
              <thead className="bg-white/[0.04] text-white">
                <tr>
                  {summaryColumns.map((column) => (
                    <th
                      key={column.label}
                      className="border-b border-r border-white/8 px-4 py-4 text-lg font-semibold last:border-r-0"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="text-white/94">
                  {summaryColumns.map((column) => (
                    <td
                      key={`${column.label}-${column.value}`}
                      className="border-r border-white/8 px-4 py-5 text-2xl font-semibold tracking-[-0.04em] last:border-r-0"
                    >
                      {column.value}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
              Subcontract Overview
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
              하청 / 업체 현황
            </h2>
            <p className="mt-2 text-sm text-white/45">
              하위 총판과 직통 업체 기준으로 충전, 수수료, 환전, 보유 현황을 확인합니다.
            </p>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {prioritizedPartnerSummaries.length ? (
              prioritizedPartnerSummaries.map((item, index) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035]"
                >
                  <div className="border-b border-white/8 bg-white/[0.045] px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100">
                            {index + 1}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70">
                            {item.type === "DOMAIN" ? "업체" : "총판"}
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
              ))
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-10 text-center text-sm text-white/42 lg:col-span-2 2xl:col-span-3">
                표시할 하청/업체 현황이 없습니다.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <div className="flex items-center justify-between">
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
                        <th
                          key={head}
                          className="border-b border-white/8 px-4 py-3 font-medium"
                        >
                          {head}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.length ? (
                    recentTransactions.slice(0, 10).map((row) => (
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
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center text-sm text-white/40"
                      >
                        표시할 거래내역이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

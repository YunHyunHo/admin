import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { DashboardHistoryPanels } from "@/components/dashboard-history-panels";
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
  const activePartnerCount = prioritizedPartnerSummaries.filter(
    (item) =>
      item.balanceTotal > 0 ||
      item.chargeTotal > 0 ||
      item.exchangeTotal > 0 ||
      item.feeTotal > 0,
  ).length;
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
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/60">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
              직속 총판 {subcontractCount}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
              직통 업체 {domainCount}
            </span>
            <span className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1.5 text-emerald-100">
              운영중 {activePartnerCount}
            </span>
          </div>
          <DashboardHistoryPanels
            partnerSummaries={prioritizedPartnerSummaries}
            recentTransactions={recentTransactions}
          />
        </section>
      </div>
    </AdminShell>
  );
}

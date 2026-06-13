import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { ChargeRequestsBoard } from "@/components/charge-requests-board";
import { DashboardHistoryPanels } from "@/components/dashboard-history-panels";
import { getSessionUser } from "@/lib/auth";
import { getChargeRequestsForUser } from "@/lib/charge-requests-repository";
import {
  getDashboardPartnerSummariesForUser,
  sortDashboardPartnerSummaries,
} from "@/lib/dashboard-summary-repository";
import { hasDatabaseUrl } from "@/lib/db";
import { getDomainExchangeOptions } from "@/lib/domain-exchanges-repository";
import { canProcessRequests } from "@/lib/permissions";
import { getTransactionLedgerRows } from "@/lib/transaction-ledger-repository";

export default async function DashboardPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const showChargeRequests = user.role === "TOP_DISTRIBUTOR" || user.role === "ADMIN";
  const [recentTransactions, partnerSummaries, chargeRequests, domainOptions] = await Promise.all([
    getTransactionLedgerRows([], user),
    getDashboardPartnerSummariesForUser(user),
    showChargeRequests ? getChargeRequestsForUser(user) : Promise.resolve(null),
    showChargeRequests ? getDomainExchangeOptions(user) : Promise.resolve([]),
  ]);
  const prioritizedPartnerSummaries = sortDashboardPartnerSummaries(partnerSummaries);

  const linkedApiCount = prioritizedPartnerSummaries.filter(
    (item) => item.hasActiveDomain,
  ).length;
  const partnerCount = prioritizedPartnerSummaries.length;
  const activePartnerCount = prioritizedPartnerSummaries.filter(
    (item) =>
      item.balanceTotal > 0 ||
      item.chargeTotal > 0 ||
      item.exchangeTotal > 0 ||
      item.feeTotal > 0,
  ).length;
  return (
    <AdminShell
      user={user}
      activeItem="dashboard-home"
      helperText=""
      partnerSummaries={prioritizedPartnerSummaries}
    >
      <div className="space-y-5">
        <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
              Subcontract Overview
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
              하청 / 업체 현황
            </h2>
            <p className="mt-2 text-sm text-white/45">
              권한 범위에 맞는 계정별 충전, 수수료, 환전, 보유 현황을 확인합니다.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/60">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
              계정 {partnerCount}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
              API 연동 {linkedApiCount}
            </span>
            <span className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1.5 text-emerald-100">
              운영중 {activePartnerCount}
            </span>
          </div>
          {showChargeRequests && chargeRequests ? (
            <div className="mt-6">
              <ChargeRequestsBoard
                initialPendingRequests={chargeRequests.pending}
                initialApprovedRequests={chargeRequests.approved}
                initialRejectedRequests={chargeRequests.rejected}
                canProcessCharges={canProcessRequests(user)}
                isDatabaseBacked={hasDatabaseUrl()}
                domainOptions={domainOptions}
              />
            </div>
          ) : (
            <DashboardHistoryPanels
              partnerSummaries={prioritizedPartnerSummaries}
              recentTransactions={recentTransactions}
            />
          )}
        </section>
      </div>
    </AdminShell>
  );
}

import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { getSessionUser } from "@/lib/auth";
import { formatKoreanWon } from "@/lib/charge-utils";
import {
  getDashboardPartnerSummariesForUser,
  getDashboardSummaryForUser,
} from "@/lib/dashboard-summary-repository";
import { getTransactionLedgerRows } from "@/lib/transaction-ledger-repository";

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

  const topMetrics = [
    { label: "도메인", value: summary.domainName },
    { label: "대기 건수", value: `${summary.pendingCount}건` },
    { label: "승인 건수", value: `${summary.approvedCount}건` },
    { label: "거절 건수", value: `${summary.rejectedCount}건` },
    { label: "대기 금액", value: formatKoreanWon(summary.pendingChargeTotal) },
    { label: "승인 충전", value: formatKoreanWon(summary.approvedChargeTotal) },
    { label: "보유 수수료", value: formatKoreanWon(summary.feeTotal) },
    { label: "요율", value: `${summary.feeRate}%` },
  ];

  return (
    <AdminShell user={user} activeItem="dashboard-home" helperText="">
      <div className="space-y-5">
        <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
              Dashboard
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
              운영 요약
            </h2>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {topMetrics.map((metric) => (
              <article
                key={`${metric.label}-${metric.value}`}
                className="rounded-2xl border border-white/8 bg-white/[0.035] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
              >
                <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-white/38">
                  {metric.label}
                </p>
                <p className="mt-3 text-[1.9rem] font-semibold tracking-[-0.05em] text-white/94">
                  {metric.value}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
            <p className="text-sm text-white/44">로그인 계정</p>
            <p className="mt-3 text-xl font-semibold text-white">
              {user.username}
            </p>
          </article>
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
            <p className="text-sm text-white/44">업체</p>
            <p className="mt-3 text-xl font-semibold text-white">
              {user.companyName}
            </p>
          </article>
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
            <p className="text-sm text-white/44">승인 충전</p>
            <p className="mt-3 text-xl font-semibold text-white">
              {formatKoreanWon(summary.approvedChargeTotal)}
            </p>
          </article>
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
            <p className="text-sm text-white/44">상태</p>
            <p className="mt-3 text-xl font-semibold text-emerald-200">정상</p>
          </article>
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
            {partnerSummaries.length ? (
              partnerSummaries.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035]"
                >
                  <div className="border-b border-white/8 bg-white/[0.045] px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold text-white">{item.name}</h3>
                      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70">
                        {item.type === "DOMAIN" ? "업체" : "하위 총판"}
                      </span>
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

import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { getSessionUser } from "@/lib/auth";
import { formatKoreanWon } from "@/lib/charge-utils";
import { getDashboardSummaryForUser } from "@/lib/dashboard-summary-repository";

export default async function DashboardPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (user.role === "MASTER") {
    redirect("/dashboard/org/distributors");
  }

  const summary = await getDashboardSummaryForUser(user);

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
      </div>
    </AdminShell>
  );
}

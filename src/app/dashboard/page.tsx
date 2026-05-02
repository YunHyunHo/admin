import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { getSessionUser } from "@/lib/auth";
import {
  approvedRequests,
  filterRequestsByCompany,
  formatKoreanWon,
  getDomainNameByCompany,
  getFeeRateByCompany,
  parseKoreanWon,
  pendingRequests,
  rejectedRequests,
} from "@/lib/mock-charge-data";

const quickCards = [
  {
    title: "연동 상태",
    value: "API 연결 준비",
    tone: "from-cyan-500/18 to-cyan-500/6 text-cyan-50 border-cyan-400/20",
  },
  {
    title: "데이터 분리",
    value: "업체별 분기 적용",
    tone: "from-emerald-500/18 to-emerald-500/6 text-emerald-50 border-emerald-400/20",
  },
  {
    title: "권한 방식",
    value: "고정 계정 로그인",
    tone: "from-amber-500/18 to-amber-500/6 text-amber-50 border-amber-400/20",
  },
];

export default async function DashboardPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const domainName = getDomainNameByCompany(user.companyName);
  const feeRate = getFeeRateByCompany(user.companyName);
  const companyPendingRequests = filterRequestsByCompany(
    pendingRequests,
    user.companyName,
  );
  const companyApprovedRequests = filterRequestsByCompany(
    approvedRequests,
    user.companyName,
  );
  const companyRejectedRequests = filterRequestsByCompany(
    rejectedRequests,
    user.companyName,
  );

  const approvedChargeTotal = companyApprovedRequests.reduce(
    (sum, item) => sum + parseKoreanWon(item.amount),
    0,
  );
  const pendingChargeTotal = companyPendingRequests.reduce(
    (sum, item) => sum + parseKoreanWon(item.amount),
    0,
  );
  const feeTotal = Math.floor(approvedChargeTotal * (feeRate / 100));

  const topMetrics = [
    { label: "도메인", value: domainName },
    { label: "대기 건수", value: `${companyPendingRequests.length}건` },
    { label: "승인 건수", value: `${companyApprovedRequests.length}건` },
    { label: "거절 건수", value: `${companyRejectedRequests.length}건` },
    { label: "대기 금액", value: formatKoreanWon(pendingChargeTotal) },
    { label: "승인 충전", value: formatKoreanWon(approvedChargeTotal) },
    { label: "수수료", value: formatKoreanWon(feeTotal) },
    { label: "요율", value: `${feeRate}%` },
  ];

  return (
    <AdminShell user={user} activeItem="dashboard-home">
      <div className="space-y-5">
        <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
                Dashboard Metrics
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
                운영 요약
              </h2>
            </div>
            <p className="text-sm text-white/46">
              상단 고정 대신 대시보드 안에서 한눈에 보이도록 배치했어.
            </p>
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

        <div className="grid h-full gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(18,24,33,0.96)_0%,_rgba(12,16,23,0.96)_100%)] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
              <p className="text-xs uppercase tracking-[0.24em] text-white/36">
                Workspace
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                대시보드
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/58">
                공유해준 구조를 기준으로, 실제 운영에 어울리게 정리한 첫 화면이야.
              </p>
            </section>

            <section className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-sm font-medium text-white/88">현재 업체</p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">
                {user.companyName}
              </p>
              <div className="mt-5 space-y-3 text-sm text-white/58">
                <div className="flex items-center justify-between">
                  <span>계정</span>
                  <span className="text-white/84">{user.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>회사 ID</span>
                  <span className="text-white/84">{user.companyId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>상태</span>
                  <span className="text-emerald-200">정상</span>
                </div>
              </div>
            </section>
          </aside>

          <section className="flex min-h-[620px] flex-col rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
            <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/55">
                  Main Canvas
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
                  첫 진입 화면
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/52">
                  실제 차트, 표, 거래 리스트, 알림 위젯이 들어갈 메인 영역이야.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickCards.map((card) => (
                  <div
                    key={card.title}
                    className={`rounded-2xl border bg-gradient-to-br px-4 py-3 ${card.tone}`}
                  >
                    <p className="text-[0.72rem] uppercase tracking-[0.2em] opacity-65">
                      {card.title}
                    </p>
                    <p className="mt-2 text-sm font-semibold tracking-[-0.02em]">
                      {card.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid flex-1 gap-5 p-5 sm:p-6 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-[28px] border border-white/8 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.08),_transparent_34%),rgba(255,255,255,0.02)] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white/48">Primary Panel</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      데이터 시각화 영역
                    </p>
                  </div>
                  <div className="rounded-full border border-white/8 bg-black/20 px-3 py-1 text-xs text-white/48">
                    Empty State
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/8 bg-black/18 p-4">
                    <p className="text-sm text-white/44">실시간 매출</p>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                      0
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/18 p-4">
                    <p className="text-sm text-white/44">활성 회원</p>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                      0
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/18 p-4">
                    <p className="text-sm text-white/44">대기 요청</p>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                      0
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex min-h-[300px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-black/16">
                  <p className="max-w-sm text-center text-sm leading-6 text-white/42">
                    차트, 누적 통계, 최근 거래 흐름, KPI 위젯을 여기에 배치할 수 있습니다.
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <section className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
                  <p className="text-sm font-medium text-white/84">운영 메모</p>
                  <div className="mt-4 space-y-3 text-sm leading-6 text-white/56">
                    <p>이 패널에는 공지, 배포 기록, 장애 체크, 업체별 전달 사항을 둘 수 있어.</p>
                    <p>현재는 구조를 먼저 정리했고, 다음 단계에서 실제 API 데이터로 연결하면 된다.</p>
                  </div>
                </section>

                <section className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
                  <p className="text-sm font-medium text-white/84">다음 작업 추천</p>
                  <div className="mt-4 space-y-3 text-sm text-white/58">
                  <div className="rounded-2xl border border-white/8 bg-black/16 px-4 py-3">
                      1. 대시보드 / 충전신청 / 도메인 정산 수치 기준 통일
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/16 px-4 py-3">
                      2. 승인 / 거절 상태 업데이트 API 구현
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/16 px-4 py-3">
                      3. 업체별 실제 DB/정산 집계 연결
                  </div>
                </div>
              </section>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AdminShell>
  );
}

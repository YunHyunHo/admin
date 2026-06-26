import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/actions/auth";
import { DashboardSummaryToggle } from "@/components/dashboard-summary-toggle";
import { GlobalDashboardSummaryPanel } from "@/components/global-dashboard-summary-panel";
import { GlobalRequestNotifier } from "@/components/global-request-notifier";
import { QuickActionNav } from "@/components/quick-action-nav";
import type { SessionUser } from "@/lib/auth";
import {
  getDashboardPartnerSummariesForUser,
  sortDashboardPartnerSummaries,
} from "@/lib/dashboard-summary-repository";
import { ThemeToggle } from "@/components/theme-toggle";

const sideMenuGroups = [
  {
    title: "대시보드",
    items: [
      {
        title: "대시보드",
        href: "/dashboard",
        key: "dashboard-home",
      },
    ],
  },
  {
    title: "조직 관리",
    masterOnly: true,
    items: [
      {
        title: "상위총판",
        href: "/dashboard/org/top-distributors",
        key: "org-top-distributors",
      },
      {
        title: "총판",
        href: "/dashboard/org/distributors",
        key: "org-distributors",
      },
      {
        title: "수수료관리",
        href: "/dashboard/settings/fee-rate",
        key: "fee-rate-settings",
      },
      {
        title: "어드민리스트",
        href: "/dashboard/admins",
        key: "admins",
      },
    ],
  },
  {
    title: "계좌",
    items: [
      {
        title: "계좌연동",
        href: "/dashboard/accounts",
        key: "accounts",
      },
    ],
  },
  {
    title: "도메인",
    items: [
      {
        title: "도메인",
        href: "/dashboard/domains/list",
        key: "domain-list",
      },
      {
        title: "도메인환전",
        href: "/dashboard/domains/exchanges",
        key: "domain-exchanges",
      },
    ],
  },
  {
    title: "거래내역",
    items: [
      {
        title: "충전신청",
        href: "/dashboard/transactions/charges",
        key: "charges",
      },
      {
        title: "Transaction",
        href: "/dashboard/transactions/transaction",
        key: "transaction",
      },
    ],
  },
  {
    title: "정산",
    items: [
      {
        title: "본사/총판 수익",
        href: "/dashboard/settlement/profit",
        key: "settlement-profit",
      },
      {
        title: "도메인 정산",
        href: "/dashboard/domain-settlement",
        key: "domain-settlement",
      },
      {
        title: "수수료 기록",
        href: "/dashboard/fee-records",
        key: "fee-records",
      },
      {
        title: "총판 환전신청",
        href: "/dashboard/settlement/distributor-withdrawals",
        key: "distributor-withdrawals",
      },
    ],
  },
];

const masterOnlyMenuKeys = new Set([
  "org-top-distributors",
  "org-distributors",
  "fee-rate-settings",
  "domain-list",
  "admins",
]);

const quickActions = [
  {
    title: "충전",
    href: "/dashboard/transactions/charges",
    key: "charges",
  },
  {
    title: "환전",
    href: "/dashboard/domains/exchanges",
    key: "domain-exchanges",
  },
  {
    title: "총판환전",
    href: "/dashboard/settlement/distributor-withdrawals",
    key: "distributor-withdrawals",
  },
];

const settlementOnlyRoles = new Set<SessionUser["role"]>([
  "TOP_DISTRIBUTOR",
  "ADMIN",
]);
const settlementOnlyMenuGroups = new Set(["대시보드", "정산"]);

type AdminShellProps = {
  user: SessionUser;
  activeItem: string;
  badge?: string;
  helperText?: string;
  children: ReactNode;
};

export async function AdminShell({
  user,
  activeItem,
  badge = "Overview",
  helperText = "원하는 데이터와 형태를 정하면 이 화면에 바로 붙일 수 있어요.",
  children,
}: AdminShellProps) {
  const userRoleLabel =
    user.role === "MASTER"
      ? "마스터"
      : user.role === "DOMAIN_ADMIN"
        ? "어드민"
      : user.role === "TOP_DISTRIBUTOR"
        ? "상위총판"
        : "총판";
  const hasMasterMenu = user.role === "MASTER" || user.role === "DOMAIN_ADMIN";
  const isSettlementOnlyUser = settlementOnlyRoles.has(user.role);
  const partnerSummaries = sortDashboardPartnerSummaries(
    await getDashboardPartnerSummariesForUser(user),
  );
  const visibleMenuGroups = sideMenuGroups
    .filter((group) => {
      if (isSettlementOnlyUser) {
        return settlementOnlyMenuGroups.has(group.title);
      }

      return hasMasterMenu || !group.masterOnly;
    })
    .map((group) => ({
      ...group,
      items:
        hasMasterMenu
          ? group.items
          : group.items.filter((item) => !masterOnlyMenuKeys.has(item.key)),
    }))
    .filter((group) => group.items.length > 0);
  const visibleQuickActions = isSettlementOnlyUser ? [] : quickActions;

  return (
    <main className="admin-app-shell min-h-screen bg-[#09090b] text-white">
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.12),_transparent_22%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_24%),linear-gradient(180deg,_#09090b_0%,_#0f1117_100%)]">
        <div className="flex min-h-screen">
          <aside className="hidden w-[308px] shrink-0 border-r border-cyan-300/30 bg-[linear-gradient(180deg,_rgba(19,23,31,0.96)_0%,_rgba(12,14,19,0.98)_100%)] xl:flex xl:flex-col">
            <div className="border-b border-cyan-300/24 px-7 pb-7 pt-8">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-500/16 text-sm font-semibold text-cyan-200 ring-1 ring-cyan-400/20">
                  VA
                </div>
                <div>
                  <p className="text-[1.05rem] font-semibold tracking-[-0.02em] text-white">
                    {userRoleLabel}[{user.companyName}]
                  </p>
                  <p className="mt-1 text-xs font-medium text-white/45">
                    version 03.10
                  </p>
                </div>
              </div>

              <div className="mt-7 rounded-3xl border border-cyan-300/24 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-white/38">
                      Logged In
                    </p>
                    <p className="mt-2 text-sm font-medium text-white/88">
                      {user.username}
                    </p>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/12 px-3 py-1 text-xs font-medium text-emerald-200">
                    Active
                  </div>
                </div>
              </div>
            </div>

            <nav className="flex-1 px-4 py-5">
              <div className="space-y-4">
                {visibleMenuGroups.map((group) => {
                  const isGroupActive = group.items.some(
                    (menu) => menu.key === activeItem,
                  );

                  return (
                    <details
                      key={group.title}
                      open={isGroupActive}
                      className={`rounded-[24px] border p-2 ${
                        isGroupActive
                          ? "border-cyan-400/14 bg-cyan-500/[0.04]"
                          : "border-cyan-300/20 bg-white/[0.025]"
                      }`}
                    >
                      <summary className="group flex cursor-pointer list-none items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/[0.04] [&::-webkit-details-marker]:hidden">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
                          {group.title}
                        </p>
                        <span className="text-white/24 transition group-open:rotate-180">
                          ⌄
                        </span>
                      </summary>

                      <div className="mt-1 space-y-1">
                        {group.items.map((menu) => (
                          <Link
                            key={menu.key}
                            href={menu.href}
                            className={`block rounded-2xl px-4 py-3 text-[0.94rem] font-medium ring-1 transition ${
                              menu.key === activeItem
                                ? "bg-cyan-500/14 text-cyan-100 ring-cyan-400/18"
                                : "bg-transparent text-white/62 ring-transparent hover:bg-white/[0.05] hover:text-white/88"
                            }`}
                          >
                            {menu.title}
                          </Link>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </nav>
          </aside>

          <section className="flex min-h-screen min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 border-b border-cyan-300/24 bg-[#0b0d12]/92 shadow-[0_16px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl">
              <div className="flex min-h-[72px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label="메뉴 열기"
                    className="grid h-11 w-11 place-items-center rounded-2xl border border-white/8 bg-white/[0.03] text-lg text-white/72 xl:hidden"
                  >
                    ☰
                  </button>
                  <div className="min-w-0 lg:hidden">
                    <p className="truncate text-sm font-medium text-white/88">
                      {user.companyName}
                    </p>
                    <p className="mt-1 text-xs text-white/42">
                      {user.username}
                    </p>
                  </div>
                </div>
                <div className="hidden min-w-0 lg:block">
                  <p className="truncate text-sm font-medium text-white/88">
                    {user.companyName}
                  </p>
                  <p className="mt-1 text-xs text-white/42">{user.username}</p>
                </div>
                {visibleQuickActions.length > 0 ? (
                  <QuickActionNav
                    actions={visibleQuickActions}
                    activeItem={activeItem}
                  />
                ) : null}
                <div className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 lg:static">
                  <GlobalRequestNotifier />
                  <DashboardSummaryToggle />
                  <ThemeToggle />
                </div>
              </div>
            </header>

            <div className="flex min-w-0 flex-1 flex-col">
              <GlobalDashboardSummaryPanel
                partnerSummaries={partnerSummaries}
                canReorder={user.role === "MASTER"}
              />
              <div className="flex flex-col gap-3 border-b border-cyan-300/24 px-4 py-4 text-sm text-white/68 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/42">
                    {badge}
                  </span>
                  <span className="font-medium text-white/88">
                    {user.companyName}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {helperText ? (
                    <span className="hidden text-white/48 md:block">
                      {helperText}
                    </span>
                  ) : null}
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/84 transition hover:bg-white/[0.07]"
                    >
                      로그아웃
                    </button>
                  </form>
                </div>
              </div>

              <div className="flex-1 p-4 sm:p-6">{children}</div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

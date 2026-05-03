import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/actions/auth";
import type { SessionUser } from "@/lib/auth";

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
    ],
  },
  {
    title: "계좌",
    items: [
      {
        title: "계좌관리",
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
        href: "/dashboard/domains",
        key: "domains",
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
        title: "거래생성",
        href: "/dashboard/transactions/create",
        key: "transaction-create",
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
        title: "총판 환전내역",
        href: "/dashboard/settlement/distributor-withdrawals",
        key: "distributor-withdrawals",
      },
    ],
  },
  {
    title: "어드민",
    items: [
      {
        title: "어드민 리스트",
        href: "/dashboard/admins",
        key: "admins",
      },
    ],
  },
];

type AdminShellProps = {
  user: SessionUser;
  activeItem: string;
  badge?: string;
  helperText?: string;
  children: ReactNode;
};

export function AdminShell({
  user,
  activeItem,
  badge = "Overview",
  helperText = "원하는 데이터와 형태를 정하면 이 화면에 바로 붙일 수 있어요.",
  children,
}: AdminShellProps) {
  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.12),_transparent_22%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_24%),linear-gradient(180deg,_#09090b_0%,_#0f1117_100%)]">
        <div className="flex min-h-screen">
          <aside className="hidden w-[308px] shrink-0 border-r border-white/8 bg-[linear-gradient(180deg,_rgba(19,23,31,0.96)_0%,_rgba(12,14,19,0.98)_100%)] xl:flex xl:flex-col">
            <div className="border-b border-white/8 px-7 pb-7 pt-8">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-500/16 text-sm font-semibold text-cyan-200 ring-1 ring-cyan-400/20">
                  VA
                </div>
                <div>
                  <p className="text-[1.05rem] font-semibold tracking-[-0.02em] text-white">
                    총관리자[{user.companyName}]
                  </p>
                  <p className="mt-1 text-xs font-medium text-white/45">
                    version 03.10
                  </p>
                </div>
              </div>

              <div className="mt-7 rounded-3xl border border-white/8 bg-white/[0.03] p-4">
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
                {sideMenuGroups.map((group) => {
                  const isGroupActive = group.items.some(
                    (menu) => menu.key === activeItem,
                  );

                  return (
                    <div
                      key={group.title}
                      className={`rounded-[24px] border p-2 ${
                        isGroupActive
                          ? "border-cyan-400/14 bg-cyan-500/[0.04]"
                          : "border-white/6 bg-white/[0.025]"
                      }`}
                    >
                      <div className="flex items-center justify-between px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
                          {group.title}
                        </p>
                        <span className="text-white/24">⌄</span>
                      </div>

                      <div className="space-y-1">
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
                    </div>
                  );
                })}
              </div>
            </nav>
          </aside>

          <section className="flex min-h-screen min-w-0 flex-1 flex-col">
            <header className="border-b border-white/8 bg-black/18 backdrop-blur-xl">
              <div className="flex min-h-[88px] items-center justify-between gap-3 px-4 sm:px-6">
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label="메뉴 열기"
                    className="grid h-11 w-11 place-items-center rounded-2xl border border-white/8 bg-white/[0.03] text-lg text-white/72 xl:hidden"
                  >
                    ☰
                  </button>
                  <div className="hidden items-center gap-2 xl:flex">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/8 bg-white/[0.03] text-white/65">
                      ☰
                    </div>
                    <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/8 bg-white/[0.03] text-white/65">
                      ‹›
                    </div>
                    <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/8 bg-white/[0.03] text-white/65">
                      ▦
                    </div>
                  </div>
                </div>
                <div className="hidden rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-white/46 md:block">
                  Vendor Admin Workspace
                </div>
              </div>
            </header>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-col gap-3 border-b border-white/8 px-4 py-4 text-sm text-white/68 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/42">
                    {badge}
                  </span>
                  <span className="font-medium text-white/88">{user.companyName}</span>
                  <span className="text-white/20">/</span>
                  <span>{user.apiLabel}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="hidden text-white/48 md:block">
                    {helperText}
                  </span>
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

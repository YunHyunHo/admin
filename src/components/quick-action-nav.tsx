"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  pendingRequestCountsEventName,
  type PendingRequestCounts,
} from "@/components/global-request-notifier";

type QuickAction = {
  title: string;
  href: string;
  key: string;
};

type QuickActionNavProps = {
  actions: QuickAction[];
  activeItem: string;
};

const initialCounts: PendingRequestCounts = {
  charges: 0,
  domainExchanges: 0,
  distributorWithdrawals: 0,
};

function getCountForAction(actionKey: string, counts: PendingRequestCounts) {
  if (actionKey === "charges") {
    return counts.charges;
  }

  if (actionKey === "domain-exchanges") {
    return counts.domainExchanges;
  }

  if (actionKey === "distributor-withdrawals") {
    return counts.distributorWithdrawals;
  }

  return 0;
}

export function QuickActionNav({ actions, activeItem }: QuickActionNavProps) {
  const [counts, setCounts] = useState<PendingRequestCounts>(initialCounts);

  useEffect(() => {
    function handleCountsUpdate(event: Event) {
      const countsEvent = event as CustomEvent<PendingRequestCounts>;
      setCounts(countsEvent.detail);
    }

    window.addEventListener(pendingRequestCountsEventName, handleCountsUpdate);

    return () => {
      window.removeEventListener(
        pendingRequestCountsEventName,
        handleCountsUpdate,
      );
    };
  }, []);

  return (
    <nav
      aria-label="거래 바로가기"
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-center"
    >
      {actions.map((action) => {
        const isActive = action.key === activeItem;
        const pendingCount = getCountForAction(action.key, counts);

        return (
          <Link
            key={action.key}
            href={action.href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex h-10 min-w-[6.75rem] items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition sm:min-w-[7.25rem] ${
              isActive
                ? "border-cyan-300/34 bg-cyan-400/16 text-cyan-50 shadow-[0_0_0_1px_rgba(103,232,249,0.10)]"
                : "border-white/10 bg-white/[0.04] text-white/78 hover:border-white/18 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {action.title} {pendingCount}개
          </Link>
        );
      })}
    </nav>
  );
}

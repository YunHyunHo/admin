"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  pendingRequestCountsEventName,
  pendingRequestCountsStorageKey,
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

    try {
      const savedCounts = JSON.parse(
        window.sessionStorage.getItem(pendingRequestCountsStorageKey) ?? "null",
      ) as Partial<PendingRequestCounts> | null;

      if (savedCounts) {
        setCounts({
          charges: Number(savedCounts.charges ?? 0),
          domainExchanges: Number(savedCounts.domainExchanges ?? 0),
          distributorWithdrawals: Number(savedCounts.distributorWithdrawals ?? 0),
        });
      }
    } catch {
      // Keep zero counts until the live request finishes.
    }

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
        const hasUrgentPending =
          pendingCount > 0 &&
          (action.key === "domain-exchanges" ||
            action.key === "distributor-withdrawals");

        return (
          <Link
            key={action.key}
            href={action.href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex h-10 min-w-[6.75rem] items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition sm:min-w-[7.25rem] ${
              hasUrgentPending
                ? "border-rose-300/70 bg-rose-500/28 text-rose-50 shadow-[0_0_22px_rgba(244,63,94,0.28)] hover:bg-rose-500/36"
                : isActive
                ? "border-cyan-300/34 bg-cyan-400/16 text-cyan-50 shadow-[0_0_0_1px_rgba(103,232,249,0.10)]"
                : "border-white/10 bg-white/[0.04] text-white/78 hover:border-white/18 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {hasUrgentPending ? (
              <span
                aria-hidden="true"
                className="h-2 w-2 animate-pulse rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.95)]"
              />
            ) : null}
            {action.title} {pendingCount}개
          </Link>
        );
      })}
    </nav>
  );
}

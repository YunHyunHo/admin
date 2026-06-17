"use client";

import { useState } from "react";

const summaryToggleEvent = "dashboard-summary-toggle";

export function DashboardSummaryToggle() {
  const [isOpen, setIsOpen] = useState(false);

  function handleToggle() {
    setIsOpen((current) => {
      const nextOpen = !current;
      window.dispatchEvent(
        new CustomEvent(summaryToggleEvent, {
          detail: { open: nextOpen },
        }),
      );
      return nextOpen;
    });
  }

  return (
    <button
      type="button"
      aria-label={isOpen ? "하청 업체 현황 닫기" : "하청 업체 현황 열기"}
      aria-expanded={isOpen}
      title={isOpen ? "현황 닫기" : "현황 열기"}
      onClick={handleToggle}
      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-cyan-300/18 bg-cyan-400/[0.08] px-3 text-sm font-semibold text-cyan-50 shadow-[0_0_0_1px_rgba(103,232,249,0.06)] transition hover:border-cyan-300/30 hover:bg-cyan-400/[0.14]"
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-300/12 text-xs text-cyan-100">
        {isOpen ? "⌃" : "⌄"}
      </span>
      <span className="hidden sm:inline">
        {isOpen ? "현황 닫기" : "현황 열기"}
      </span>
      <span className="sm:hidden">현황</span>
    </button>
  );
}

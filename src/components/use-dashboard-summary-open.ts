"use client";

import { useSyncExternalStore } from "react";

const summaryToggleEvent = "dashboard-summary-toggle";
const summaryOpenStorageKey = "winpay-dashboard-summary-open";

function subscribe(callback: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === summaryOpenStorageKey) {
      callback();
    }
  }

  window.addEventListener(summaryToggleEvent, callback);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(summaryToggleEvent, callback);
    window.removeEventListener("storage", handleStorage);
  };
}

function getSnapshot() {
  return window.localStorage.getItem(summaryOpenStorageKey) !== "false";
}

function getServerSnapshot() {
  return true;
}

export function useDashboardSummaryOpen() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setDashboardSummaryOpen(open: boolean) {
  window.localStorage.setItem(summaryOpenStorageKey, String(open));
  window.dispatchEvent(new Event(summaryToggleEvent));
}

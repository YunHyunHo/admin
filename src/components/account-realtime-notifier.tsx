"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { GlobalRequestNotifier } from "@/components/global-request-notifier";
import { usePathname } from "next/navigation";

type Props = ComponentProps<typeof GlobalRequestNotifier> & { accountModeControlEnabled: boolean };

export function AccountRealtimeNotifier({ accountModeControlEnabled, ...props }: Props) {
  const [mode, setMode] = useState<"legacy" | "websocket">("legacy");
  const [metrics, setMetrics] = useState({ requests: 0, startedAt: 0, lastCheckAt: 0 });
  const pathname = usePathname();
  useEffect(() => {
    if (!accountModeControlEnabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    let running = false;
    let intervalMs = 5000;
    async function check() {
      if (stopped || running) return;
      running = true;
      const now = Date.now();
      setMetrics(previous => ({ requests: previous.requests + 1, startedAt: previous.startedAt || now, lastCheckAt: now }));
      clearTimeout(timer);
      controller = new AbortController();
      const deadline = setTimeout(() => controller?.abort(), 2000);
      let next: "legacy" | "websocket" = "legacy";
      try {
        const response = await fetch("/api/realtime-mode", { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          if (data.mode === "websocket") next = "websocket";
          if ([5000, 30000, 60000].includes(data.checkIntervalMs)) intervalMs = data.checkIntervalMs;
        }
      } catch { /* Fail closed to the established notification transport. */ }
      finally { clearTimeout(deadline); running = false; }
      if (!stopped) {
        setMode(next);
        timer = setTimeout(check, intervalMs);
      }
    }
    void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    const onReconnect = () => { void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("realtime-control-refresh", onReconnect);
    return () => {
      stopped = true; clearTimeout(timer); controller?.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("realtime-control-refresh", onReconnect);
    };
  }, [accountModeControlEnabled, pathname]);

  if (!accountModeControlEnabled) return <GlobalRequestNotifier {...props} />;
  // Do not remount on mode changes: preserve counts, sound readiness and dedup state.
  return <><output className="sr-only" aria-label="Realtime control diagnostics">
    {JSON.stringify({ mode, ...metrics })}
  </output><GlobalRequestNotifier {...props}
    realtimeEventsEnabled
    realtimeEventsPath="/api/request-events"
    eventDrivenSnapshotEnabled={mode === "websocket"}
    webSocketTransportEnabled={mode === "websocket"}
    externalWebSocketTransportEnabled={mode === "websocket"}
    periodicFallbackSyncEnabled={mode === "legacy"}
    fallbackPollIntervalMs={1000}
  /></>;
}

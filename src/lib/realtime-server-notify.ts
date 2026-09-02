import { waitUntil } from "@vercel/functions";

import { getRealtimeServerInternalConfig } from "@/lib/realtime-server-config";

const retryDelaysMs = [0, 150, 500];
const requestTimeoutMs = 800;

async function delay(ms: number) {
  if (ms <= 0) {
    return;
  }

  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function notifyRealtimeServer(eventId: string) {
  const config = getRealtimeServerInternalConfig();

  if (!config) {
    return;
  }

  for (const retryDelayMs of retryDelaysMs) {
    await delay(retryDelayMs);

    try {
      const response = await fetch(new URL("/internal/events", config.url), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ eventId }),
        cache: "no-store",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      if (response.ok) {
        return;
      }
    } catch {
      // The Outbox reconciliation path recovers after the short fast-path retries.
    }
  }

  console.error("[realtime-fast-path] delivery deferred to Outbox recovery", {
    eventId,
  });
}

export function scheduleRealtimeServerNotification(eventId: string) {
  if (!getRealtimeServerInternalConfig()) {
    return;
  }

  waitUntil(notifyRealtimeServer(eventId));
}

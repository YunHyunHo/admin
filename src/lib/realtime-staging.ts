import { createHmac } from "node:crypto";
import { waitUntil } from "@vercel/functions";

import type { SessionUser } from "@/lib/auth";
import type { StoredAdminRequestEvent } from "@/lib/admin-request-events";

const realtimeAudience = "winpay-realtime-staging";
const deliveryAttempts = 3;
const deliveryTimeoutMs = 1200;
const mapleRealtimeLoginIds = new Set(["maple", "test05"]);

function getRealtimeUrl() {
  return process.env.MAPLE_REALTIME_URL?.trim().replace(/\/$/, "") ?? "";
}

function getSharedSecret() {
  return process.env.REALTIME_SHARED_SECRET?.trim() ?? "";
}

function isPreviewEnvironment() {
  return process.env.VERCEL_ENV === "preview";
}

export function isMapleRealtimeStagingConfigured() {
  return (
    isPreviewEnvironment() &&
    getRealtimeUrl().length > 0 &&
    getSharedSecret().length >= 32
  );
}

export function isMapleRealtimeStagingUser(
  user: Pick<SessionUser, "loginId">,
) {
  return (
    isMapleRealtimeStagingConfigured() &&
    mapleRealtimeLoginIds.has(user.loginId.trim().toLowerCase())
  );
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createMapleRealtimeToken(input: {
  user: SessionUser;
  clientInstanceId: string;
}) {
  if (!isMapleRealtimeStagingUser(input.user)) {
    throw new Error("Maple Preview 실시간 연결을 사용할 수 없습니다.");
  }

  const payload = base64UrlJson({
    aud: realtimeAudience,
    exp: Math.floor(Date.now() / 1000) + 60,
    iat: Math.floor(Date.now() / 1000),
    loginId: input.user.loginId,
    role: input.user.role,
    clientInstanceId: input.clientInstanceId,
  });
  const signature = createHmac("sha256", getSharedSecret())
    .update(payload)
    .digest("base64url");

  return {
    token: `${payload}.${signature}`,
    webSocketUrl: `${getRealtimeUrl().replace(/^http/, "ws")}/ws`,
  };
}

async function deliverEventId(event: StoredAdminRequestEvent) {
  const url = getRealtimeUrl();
  const secret = getSharedSecret();

  for (let attempt = 1; attempt <= deliveryAttempts; attempt += 1) {
    try {
      const response = await fetch(`${url}/internal/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-realtime-secret": secret,
        },
        body: JSON.stringify({ eventId: event.eventId }),
        signal: AbortSignal.timeout(deliveryTimeoutMs),
      });

      if (response.ok) {
        console.info("[maple-realtime] fast-path-delivered", {
          eventId: event.eventId,
          attempt,
        });
        return;
      }
    } catch {
      // Recovery is guaranteed by the durable Outbox reconciliation path.
    }

    if (attempt < deliveryAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }

  console.warn("[maple-realtime] fast-path-deferred-to-recovery", {
    eventId: event.eventId,
  });
}

export function scheduleMapleRealtimeDelivery(event: StoredAdminRequestEvent) {
  if (
    !isMapleRealtimeStagingConfigured()
  ) {
    return;
  }

  const delivery = deliverEventId(event).catch(() => undefined);

  try {
    waitUntil(delivery);
  } catch {
    void delivery;
  }
}

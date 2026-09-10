import type { SessionUser } from "@/lib/auth";
import {
  getRealtimeAccountControl,
  type RealtimeAccountControl,
} from "@/lib/realtime-account-mode";

export type RealtimeClientDiagnostic = {
  mode?: string;
  modeReason?: string;
  tokenStatus?: string;
  wsStatus?: string;
  fallbackReason?: string;
  buildVersion?: string;
  clientInstanceId?: string;
  visibilityState?: string;
  connectedAt?: string;
  lastHeartbeatAt?: string;
  timeoutDetectedAt?: string;
  closeCode?: number;
  closeReason?: string;
  fallbackEnteredAt?: string;
};

function clean(value: unknown, maximumLength = 120) {
  return typeof value === "string"
    ? value.replace(/[\r\n\t]/g, " ").slice(0, maximumLength)
    : undefined;
}

export function getRealtimeBuildVersion() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.VERCEL_DEPLOYMENT_ID?.slice(0, 48) ||
    "unknown"
  );
}

export function parseRealtimeClientDiagnostic(
  value: unknown,
): RealtimeClientDiagnostic {
  const input = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};

  return {
    mode: clean(input.mode, 24),
    modeReason: clean(input.modeReason),
    tokenStatus: clean(input.tokenStatus, 40),
    wsStatus: clean(input.wsStatus, 80),
    fallbackReason: clean(input.fallbackReason),
    buildVersion: clean(input.buildVersion, 64),
    clientInstanceId: clean(input.clientInstanceId, 80),
    visibilityState: clean(input.visibilityState, 24),
    connectedAt: clean(input.connectedAt, 48),
    lastHeartbeatAt: clean(input.lastHeartbeatAt, 48),
    timeoutDetectedAt: clean(input.timeoutDetectedAt, 48),
    closeCode: typeof input.closeCode === "number"
      ? input.closeCode
      : undefined,
    closeReason: clean(input.closeReason, 120),
    fallbackEnteredAt: clean(input.fallbackEnteredAt, 48),
  };
}

export async function logAdminRealtimeDiagnostic(input: {
  request: Request;
  user: SessionUser;
  event: string;
  client?: RealtimeClientDiagnostic;
  control?: RealtimeAccountControl;
}) {
  const control = input.control ?? await getRealtimeAccountControl(input.user);
  const client = input.client ?? {};
  const host = input.request.headers.get("x-forwarded-host")
    ?? input.request.headers.get("host")
    ?? new URL(input.request.url).host;

  console.info("[realtime-diagnostic]", JSON.stringify({
    timestamp: new Date().toISOString(),
    event: clean(input.event, 60),
    domain: clean(host, 160),
    loginId: input.user.loginId,
    role: input.user.role,
    finalMaster: control.ownerLoginId,
    realtimeEnabled: control.mode === "websocket",
    realtimeEligible: control.eligible,
    mode: client.mode ?? control.mode,
    serverMode: control.mode,
    clientMode: client.mode ?? "unknown",
    modeReason: client.modeReason ?? control.reason,
    controlReason: control.reason,
    tokenStatus: client.tokenStatus ?? "unknown",
    wsStatus: client.wsStatus ?? "unknown",
    fallbackReason: client.fallbackReason ?? "none",
    buildVersion: client.buildVersion ?? getRealtimeBuildVersion(),
    clientInstanceId: client.clientInstanceId ?? "unknown",
    visibilityState: client.visibilityState ?? "unknown",
    connectedAt: client.connectedAt ?? null,
    lastHeartbeatAt: client.lastHeartbeatAt ?? null,
    timeoutDetectedAt: client.timeoutDetectedAt ?? null,
    closeCode: client.closeCode ?? null,
    closeReason: client.closeReason ?? null,
    fallbackEnteredAt: client.fallbackEnteredAt ?? null,
  }));
}

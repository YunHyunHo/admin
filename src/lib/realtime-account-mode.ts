import type { SessionUser } from "@/lib/auth";
import {
  getAdminRealtimeEligibility,
  getRealtimeGroupMode,
} from "@/lib/realtime-staging";

export type RealtimeAccountControl = {
  mode: "legacy" | "websocket";
  eligible: boolean;
  ownerLoginId: string | null;
  reason:
    | "flag-websocket"
    | "flag-legacy"
    | "realtime-not-configured"
    | "master-not-resolved"
    | "owner-not-enabled"
    | "control-error";
};

export async function getRealtimeAccountControl(
  user: SessionUser,
): Promise<RealtimeAccountControl> {
  try {
    const eligibility = await getAdminRealtimeEligibility(user);
    if (!eligibility.configured) {
      return {
        mode: "legacy",
        eligible: false,
        ownerLoginId: eligibility.ownerLoginId,
        reason: "realtime-not-configured",
      };
    }
    if (!eligibility.ownerLoginId) {
      return {
        mode: "legacy",
        eligible: false,
        ownerLoginId: null,
        reason: "master-not-resolved",
      };
    }
    if (!eligibility.ownerEnabled) {
      return {
        mode: "legacy",
        eligible: false,
        ownerLoginId: eligibility.ownerLoginId,
        reason: "owner-not-enabled",
      };
    }
    const mode = await getRealtimeGroupMode(eligibility.ownerLoginId);
    return {
      mode,
      eligible: true,
      ownerLoginId: eligibility.ownerLoginId,
      reason: mode === "websocket" ? "flag-websocket" : "flag-legacy",
    };
  } catch {
    // Control-plane failure must preserve the established notification path.
    return {
      mode: "legacy",
      eligible: false,
      ownerLoginId: null,
      reason: "control-error",
    };
  }
}

export async function getRealtimeAccountMode(user: SessionUser) {
  return (await getRealtimeAccountControl(user)).mode;
}

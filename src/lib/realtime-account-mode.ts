import type { SessionUser } from "@/lib/auth";
import {
  getAdminRealtimePrincipal,
  getRealtimeGroupMode,
} from "@/lib/realtime-staging";

export async function getRealtimeAccountControl(
  user: SessionUser,
): Promise<{ mode: "legacy" | "websocket"; eligible: boolean }> {
  try {
    const principal = await getAdminRealtimePrincipal(user);
    if (!principal) return { mode: "legacy", eligible: false };
    return {
      mode: await getRealtimeGroupMode(principal.ownerLoginId),
      eligible: true,
    };
  } catch {
    // Control-plane failure must preserve the established notification path.
    return { mode: "legacy", eligible: false };
  }
}

export async function getRealtimeAccountMode(user: SessionUser) {
  return (await getRealtimeAccountControl(user)).mode;
}

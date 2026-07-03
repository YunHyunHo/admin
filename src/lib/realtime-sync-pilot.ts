import type { SessionUser } from "@/lib/auth";

const pilotLoginIds = new Set(["maple"]);

export function isRealtimeSyncPilot(user: Pick<SessionUser, "loginId">) {
  return pilotLoginIds.has(user.loginId.trim().toLowerCase());
}

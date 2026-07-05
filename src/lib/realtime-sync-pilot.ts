import type { SessionUser } from "@/lib/auth";

export function isRealtimeSyncPilot(user: Pick<SessionUser, "loginId">) {
  void user;
  return true;
}

export function isReducedNotificationPollingPilot(
  user: Pick<SessionUser, "loginId">,
) {
  return user.loginId.trim().toLowerCase() === "maple";
}

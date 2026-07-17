import type { SessionUser } from "@/lib/auth";

export function isRealtimeSyncPilot(user: Pick<SessionUser, "loginId">) {
  void user;
  return true;
}

export function isReducedNotificationPollingPilot(
  user: Pick<SessionUser, "loginId">,
) {
  void user;
  return false;
}

export function isReliableNoticeSoundEnabled(
  user: Pick<SessionUser, "loginId">,
) {
  void user;
  return true;
}

import type { SessionUser } from "@/lib/auth";

const defaultNotificationFallbackPollIntervalMs = 1_000;
const mapleNotificationFallbackPollIntervalMs = 20_000;
const reducedNotificationFallbackPollIntervalMs = 30_000;

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

export function getNotificationFallbackPollIntervalMs(
  user: Pick<SessionUser, "loginId">,
) {
  if (user.loginId.trim().toLowerCase() === "maple") {
    return mapleNotificationFallbackPollIntervalMs;
  }

  return isReducedNotificationPollingPilot(user)
    ? reducedNotificationFallbackPollIntervalMs
    : defaultNotificationFallbackPollIntervalMs;
}

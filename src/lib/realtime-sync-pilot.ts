import type { SessionUser } from "@/lib/auth";

const defaultNotificationFallbackPollIntervalMs = 1_000;
const reducedNotificationFallbackPollIntervalMs = 30_000;
const requestBoardFallbackRefreshIntervalMs = 60_000;

function isMaplePilotUser(user: Pick<SessionUser, "loginId">) {
  return user.loginId.trim().toLowerCase() === "maple";
}

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

export function isReliableRequestEventRecoveryEnabled(
  user: Pick<SessionUser, "loginId">,
) {
  return isMaplePilotUser(user);
}

export function isLightweightRequestNotificationPilot(
  user: Pick<SessionUser, "loginId">,
) {
  void user;
  return true;
}

export function getRequestBoardFallbackRefreshIntervalMs(
  user: Pick<SessionUser, "loginId">,
) {
  void user;
  return requestBoardFallbackRefreshIntervalMs;
}

export function getNotificationFallbackPollIntervalMs(
  user: Pick<SessionUser, "loginId">,
) {
  return isReducedNotificationPollingPilot(user)
    ? reducedNotificationFallbackPollIntervalMs
    : defaultNotificationFallbackPollIntervalMs;
}

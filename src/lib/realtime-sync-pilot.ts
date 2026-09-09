import type { SessionUser } from "@/lib/auth";
import { getRealtimeAccountControl } from "@/lib/realtime-account-mode";

const defaultNotificationFallbackPollIntervalMs = 1_000;
const requestBoardFallbackRefreshIntervalMs = 60_000;

function isMaplePilotUser(user: Pick<SessionUser, "loginId">) {
  return user.loginId.trim().toLowerCase() === "maple";
}

export function isMapleImmediateRealtimePilot(
  user: Pick<SessionUser, "loginId">,
) {
  return isMaplePilotUser(user);
}

export async function isRealtimeV2Eligible(user: SessionUser) {
  return (await getRealtimeAccountControl(user)).eligible;
}

// Compatibility gates for the legacy Preview-only transports. Realtime V2
// uses isRealtimeV2Eligible and the external Railway WebSocket instead.
export function isMapleWebSocketPilot(user: Pick<SessionUser, "loginId">) {
  return ["maple", "test05"].includes(user.loginId.trim().toLowerCase());
}

export function isMapleSseNoPollingPilot(user: Pick<SessionUser, "loginId">) {
  return isMaplePilotUser(user);
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
  void user;
  return defaultNotificationFallbackPollIntervalMs;
}

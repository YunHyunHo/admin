import type { SessionUser } from "@/lib/auth";

export function isRealtimeSyncPilot(user: Pick<SessionUser, "loginId">) {
  void user;
  return true;
}

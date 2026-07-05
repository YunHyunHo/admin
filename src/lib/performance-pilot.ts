import type { SessionUser } from "@/lib/auth";

export function isPerformancePilotUser(
  user: Pick<SessionUser, "id" | "loginId" | "username" | "createdBy">,
) {
  void user;
  return true;
}

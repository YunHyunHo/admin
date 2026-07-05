import type { SessionUser } from "@/lib/auth";

const performancePilotLoginIds = new Set([
  "maple",
  "as@112233",
]);

export function isPerformancePilotUser(
  user: Pick<SessionUser, "loginId" | "username">,
) {
  return (
    performancePilotLoginIds.has(user.loginId) ||
    performancePilotLoginIds.has(user.username)
  );
}

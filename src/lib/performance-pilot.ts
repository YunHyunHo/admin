import type { SessionUser } from "@/lib/auth";

const performancePilotMasterLoginIds = new Set(["maple"]);
const performancePilotMasterAdminIds = new Set([
  "038da711-5b5d-46b0-9ffa-568455a3283c",
]);

export function isPerformancePilotUser(
  user: Pick<SessionUser, "id" | "loginId" | "username" | "createdBy">,
) {
  return (
    performancePilotMasterLoginIds.has(user.loginId) ||
    performancePilotMasterLoginIds.has(user.username) ||
    performancePilotMasterAdminIds.has(user.id) ||
    (user.createdBy !== null &&
      performancePilotMasterAdminIds.has(user.createdBy))
  );
}

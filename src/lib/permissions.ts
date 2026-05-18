import type { SessionUser } from "@/lib/auth";

export function canManageMasterResources(user: Pick<SessionUser, "role">) {
  return user.role === "MASTER";
}

export function canUseDistributorMenus(user: Pick<SessionUser, "role">) {
  return user.role === "ADMIN" || user.role === "TOP_DISTRIBUTOR";
}

export function canProcessRequests(user: Pick<SessionUser, "role">) {
  return canManageMasterResources(user) || canUseDistributorMenus(user);
}

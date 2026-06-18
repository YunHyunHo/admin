import type { SessionUser } from "@/lib/auth";

export function canManageMasterResources(user: Pick<SessionUser, "role">) {
  return user.role === "MASTER" || user.role === "DOMAIN_ADMIN";
}

export function canUseDistributorMenus(user: Pick<SessionUser, "role">) {
  return (
    user.role === "ADMIN" ||
    user.role === "TOP_DISTRIBUTOR" ||
    user.role === "DOMAIN_ADMIN"
  );
}

export function canProcessRequests(user: Pick<SessionUser, "role">) {
  return canManageMasterResources(user) || canUseDistributorMenus(user);
}

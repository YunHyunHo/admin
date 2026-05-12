import type { SessionUser } from "@/lib/auth";

export function canManageMasterResources(user: Pick<SessionUser, "role">) {
  return user.role === "MASTER";
}

export function canProcessRequests(user: Pick<SessionUser, "role">) {
  return user.role === "MASTER" || user.role === "ADMIN";
}

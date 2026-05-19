import type { SessionUser } from "@/lib/auth";

export function getScopedDistributorCondition(
  user: Pick<SessionUser, "id" | "role">,
  distributorAlias = "dist",
  distributorAdminAlias = "dist_admin",
) {
  if (user.role === "MASTER") {
    return {
      sql: `and ${distributorAdminAlias}.created_by = $1::uuid`,
      values: [user.id],
    };
  }

  return {
    sql: `and ${distributorAlias}.admin_id = $1::uuid`,
    values: [user.id],
  };
}

export function getScopedMasterNameExpression(
  user: Pick<SessionUser, "role">,
  fallbackExpression = "owner_master.name",
) {
  return user.role === "MASTER" ? "$1::text" : fallbackExpression;
}

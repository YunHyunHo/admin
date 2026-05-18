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

  if (user.role === "TOP_DISTRIBUTOR") {
    return {
      sql: `and (${distributorAlias}.admin_id = $1::uuid or ${distributorAlias}.parent_distributor_id in (select parent_scope.id from distributors parent_scope where parent_scope.admin_id = $1::uuid))`,
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

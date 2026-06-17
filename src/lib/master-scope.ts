import type { SessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

export type ScopedClause = {
  sql: string;
  values: unknown[];
};

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

export function getMasterOwnedCompanyExistsCondition(
  companyIdExpression: string,
  param = "$1",
) {
  return `
    exists (
      select 1
      from admin_company_mappings scoped_acm
      join admins scoped_admin on scoped_admin.id = scoped_acm.admin_id
      where scoped_acm.company_id = ${companyIdExpression}
        and scoped_admin.created_by = ${param}::uuid
        and scoped_admin.role = 'DOMAIN_ADMIN'
        and scoped_admin.status <> 'DELETED'
    )
  `;
}

export function getScopedMasterNameExpression(
  user: Pick<SessionUser, "role">,
  fallbackExpression = "owner_master.name",
) {
  return user.role === "MASTER" ? "$1::text" : fallbackExpression;
}

export async function getManagedCompanyIds(userId: string) {
  const result = await query<{ company_id: string }>(
    `
      select acm.company_id::text as company_id
      from admin_company_mappings acm
      join companies c on c.id = acm.company_id
      where acm.admin_id = $1::uuid
        and c.status = 'ACTIVE'
      order by c.company_name asc
    `,
    [userId],
  );

  return result.rows.map((row) => row.company_id);
}

export async function getScopedDataCondition(
  user: Pick<SessionUser, "id" | "role">,
  aliases: {
    company?: string;
    distributor?: string;
    distributorAdmin?: string;
  } = {},
): Promise<ScopedClause> {
  if (user.role === "MASTER") {
    const companyAlias = aliases.company;
    const companyScope = companyAlias
      ? getMasterOwnedCompanyExistsCondition(`${companyAlias}.company_id`)
      : "";
    const distributorScope = `${aliases.distributorAdmin ?? "dist_admin"}.created_by = $1::uuid`;
    const conditions = [distributorScope, companyScope].filter(Boolean);

    return {
      sql: conditions.length ? `and (${conditions.join(" or ")})` : "and 1 = 0",
      values: [user.id],
    };
  }

  if (user.role === "DOMAIN_ADMIN") {
    const companyIds = await getManagedCompanyIds(user.id);

    if (!companyIds.length) {
      return {
        sql: "and 1 = 0",
        values: [],
      };
    }

    return {
      sql: `and ${(aliases.company ?? "c")}.company_id = any($1::uuid[])`,
      values: [companyIds],
    };
  }

  return getScopedDistributorCondition(
    user,
    aliases.distributor,
    aliases.distributorAdmin,
  );
}

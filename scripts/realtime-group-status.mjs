import fs from "node:fs";
import process from "node:process";
import { Pool } from "pg";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, index);
    if (!process.env[key]) process.env[key] = line.slice(index + 1);
  }
}

const [environment, ownerLoginIdRaw] = process.argv.slice(2);
const ownerLoginId = ownerLoginIdRaw?.trim().toLowerCase();

if (!["preview", "production"].includes(environment) || !ownerLoginId) {
  throw new Error(
    "사용법: node scripts/realtime-group-status.mjs <preview|production> <ownerLoginId>",
  );
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL을 확인해주세요.");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  const result = await pool.query(
    `with recursive owner as (
       select id, lower(login_id) login_id
       from admins
       where lower(login_id) = $1 and role = 'MASTER' and status <> 'DELETED'
       limit 1
     ), account_tree as (
       select a.id, a.login_id, a.role::text role, a.created_by,
              array[a.id] path, 0 depth
       from admins a
       join owner o on a.id = o.id
       union all
       select child.id, child.login_id, child.role::text, child.created_by,
              tree.path || child.id, tree.depth + 1
       from account_tree tree
       join admins child on child.created_by = tree.id
       where child.status <> 'DELETED'
         and tree.depth < 31
         and not child.id = any(tree.path)
     ), group_admins as (
       select distinct on (id) id, login_id, role, depth
       from account_tree
       order by id, depth
     ), partner_domains as (
       select distinct d.id
       from domains d
       join admin_company_mappings acm on acm.company_id = d.company_id
       join group_admins ga on ga.id = acm.admin_id and ga.role = 'DOMAIN_ADMIN'
       where d.status <> 'DELETED'
     )
     select
       (select count(*)::int from group_admins) group_accounts,
       (select count(*)::int from group_admins ga join owner o on ga.id <> o.id) connected_accounts,
       (select coalesce(jsonb_object_agg(role, count), '{}'::jsonb)
          from (select role, count(*)::int count from group_admins group by role) roles) role_counts,
       (select count(*)::int from partner_domains) partner_domains,
       (select enabled from realtime_account_flags
         where environment = $2 and lower(login_id) = $1 limit 1) flag_enabled,
       (select coalesce(jsonb_agg(jsonb_build_object(
          'loginId', login_id,
          'role', role,
          'finalMaster', $1,
          'realtime', case when (select enabled from realtime_account_flags
            where environment = $2 and lower(login_id) = $1 limit 1) is true
            then 'websocket' else 'legacy' end
        ) order by depth, lower(login_id)), '[]'::jsonb) from group_admins) accounts`,
    [ownerLoginId, environment],
  );

  const row = result.rows[0];
  console.log(
    JSON.stringify(
      {
        environment,
        ownerLoginId,
        groupAccounts: row.group_accounts,
        connectedAccounts: row.connected_accounts,
        roleCounts: row.role_counts,
        partnerDomains: row.partner_domains,
        storedMode:
          row.flag_enabled === true
            ? "websocket"
            : row.flag_enabled === false
              ? "legacy"
              : "not-configured",
        accounts: row.accounts,
        localEnvironmentHints: {
          realtimeUrl: Boolean(
            process.env.REALTIME_V2_URL || process.env.MAPLE_REALTIME_URL,
          ),
          sharedSecret: Boolean(process.env.REALTIME_SHARED_SECRET),
          ownerAllowlist: (process.env.REALTIME_V2_OWNER_LOGIN_IDS ?? "")
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .includes(ownerLoginId),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}

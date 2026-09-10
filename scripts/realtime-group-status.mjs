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
     ), admin_chains as (
       select a.id root_id, a.id, a.login_id, a.role::text role, a.created_by,
              array[a.id] path, 0 depth
       from admins a
       where a.status <> 'DELETED'
       union all
       select chain.root_id, parent.id, parent.login_id, parent.role::text, parent.created_by,
              chain.path || parent.id, chain.depth + 1
       from admin_chains chain
       join admins parent on parent.id = chain.created_by
       where parent.status <> 'DELETED'
         and chain.depth < 31
         and not parent.id = any(chain.path)
     ), resolved_owners as (
       select distinct on (root_id) root_id, lower(login_id) final_master
       from admin_chains
       where role = 'MASTER'
       order by root_id, depth
     ), group_admins as (
       select a.id, a.login_id, a.role::text role,
              case when a.id = o.id then 0 else 1 end depth,
              resolved.final_master
       from admins a
       join resolved_owners resolved on resolved.root_id = a.id
       join owner o on resolved.final_master = o.login_id
       where a.status <> 'DELETED'
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
          'finalMaster', final_master,
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

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

if (!process.argv.includes("--execute")) {
  throw new Error("실행하려면 --execute가 필요합니다.");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL을 확인해주세요.");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});
const client = await pool.connect();

try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(hashtext('company-master-scope-migration'))");
  await client.query(`
    alter table companies
      add column if not exists owner_master_id uuid references admins(id) on delete set null
  `);

  const backfilled = await client.query(`
    with recursive ancestry as (
      select a.id as source_admin_id, a.id, a.role::text as role, a.created_by,
             array[a.id] as path, 0 as depth
      from admins a
      where a.status <> 'DELETED'
      union all
      select ancestry.source_admin_id, parent.id, parent.role::text,
             parent.created_by, ancestry.path || parent.id, ancestry.depth + 1
      from ancestry
      join admins parent on parent.id = ancestry.created_by
      where ancestry.depth < 31
        and not parent.id = any(ancestry.path)
        and parent.status <> 'DELETED'
    ), company_owners as (
      select mapping.company_id, ancestry.id as master_id
      from admin_company_mappings mapping
      join ancestry on ancestry.source_admin_id = mapping.admin_id
      where ancestry.role = 'MASTER'
      group by mapping.company_id, ancestry.id
    ), single_owner as (
      select company_id, min(master_id::text)::uuid as master_id
      from company_owners
      group by company_id
      having count(*) = 1
    )
    update companies company
    set owner_master_id = single_owner.master_id,
        updated_at = now()
    from single_owner
    where company.id = single_owner.company_id
      and company.owner_master_id is null
    returning company.id
  `);

  await client.query(`
    create unique index if not exists companies_owner_master_name_uidx
      on companies (owner_master_id, company_name)
      where owner_master_id is not null
  `);
  await client.query(`alter table companies drop constraint if exists companies_company_name_key`);

  const validation = (
    await client.query(`
      select
        count(*)::int total_companies,
        count(owner_master_id)::int owned_companies,
        count(*) filter (where owner_master_id is null)::int legacy_shared_companies,
        count(*) filter (where company_name = '크루벳')::int crewbet_rows,
        count(*) filter (where company_name = '전체')::int all_scope_rows
      from companies
    `)
  ).rows[0];

  await client.query("commit");
  console.log(JSON.stringify({
    status: "company-master-scope-migration-complete",
    backfilled: backfilled.rowCount,
    validation,
  }, null, 2));
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}

import { readFile } from "node:fs/promises";
import { Pool } from "pg";

async function loadLocalEnv() {
  const envUrl = new URL("../.env.local", import.meta.url);

  try {
    const envText = await readFile(envUrl, "utf8");

    for (const line of envText.split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const value = trimmedLine.slice(separatorIndex + 1).trim();

      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL 환경변수를 설정한 뒤 실행해주세요.");
  }

  return databaseUrl;
}

async function main() {
  await loadLocalEnv();

  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    ssl:
      process.env.DATABASE_SSL === "false"
        ? false
        : { rejectUnauthorized: false },
  });

  try {
    await pool.query(`
      alter table domains
        add column if not exists withdraw_bank_name text,
        add column if not exists withdraw_account_holder text,
        add column if not exists withdraw_account_number text,
        add column if not exists dashboard_position integer
    `);
    await pool.query(`
      do $$
      begin
        if not exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'domains'
            and column_name = 'linked_bank_account_id'
        ) then
          alter table domains
            add column linked_bank_account_id uuid references bank_accounts(id) on delete set null;

          update domains dom
          set linked_bank_account_id = (
            select ba.id
            from bank_accounts ba
            where ba.company_id = dom.company_id
              and (ba.distributor_id = dom.distributor_id or ba.distributor_id is null)
            order by
              case when ba.distributor_id = dom.distributor_id then 0 else 1 end,
              ba.created_at desc
            limit 1
          )
          where dom.status <> 'DELETED';
        end if;
      end
      $$
    `);
    await pool.query(`
      create index if not exists idx_domains_linked_bank_account
        on domains (linked_bank_account_id)
        where linked_bank_account_id is not null
    `);
    await pool.query(`
      alter table charge_requests
        add column if not exists account_holder text
    `);
    await pool.query(`
      create table if not exists domain_charge_integrations (
        id uuid primary key default gen_random_uuid(),
        master_admin_id uuid not null references admins(id),
        domain_id uuid not null references domains(id) on delete cascade,
        label text,
        api_key_prefix text not null,
        api_key_hash text not null unique,
        status text not null default 'ACTIVE',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        revoked_at timestamptz,
        check (status in ('ACTIVE', 'REVOKED'))
      )
    `);
    await pool.query(`
      create unique index if not exists domain_charge_integrations_active_domain_idx
        on domain_charge_integrations (domain_id)
        where status = 'ACTIVE'
    `);
    await pool.query(`
      create index if not exists domain_charge_integrations_master_status_idx
        on domain_charge_integrations (master_admin_id, status, created_at desc)
    `);

    console.log("Database migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

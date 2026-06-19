import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { Pool } from "pg";

const scrypt = promisify(scryptCallback);
const keyLength = 64;

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

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, keyLength);

  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

async function hasSchema(client) {
  const result = await client.query("select to_regclass('public.admins') as table_name");

  return Boolean(result.rows[0]?.table_name);
}

async function applySchema(client) {
  const schemaUrl = new URL("../docs/database-schema.sql", import.meta.url);
  const schemaSql = await readFile(schemaUrl, "utf8");

  await client.query(schemaSql);
}

async function applySchemaUpgrades(client) {
  await client.query(`
    alter table domains
      add column if not exists withdraw_bank_name text,
      add column if not exists withdraw_account_holder text,
      add column if not exists withdraw_account_number text
  `);
}

async function seedBaseData(client) {
  const masterPassword = process.env.MASTER_PASSWORD ?? "0000";
  const passwordHash = await hashPassword(masterPassword);
  const companyResult = await client.query(
    `
      insert into companies (company_name, status)
      values ('전체', 'ACTIVE')
      on conflict (company_name) do update
      set status = 'ACTIVE', updated_at = now()
      returning id
    `,
  );
  const companyId = companyResult.rows[0]?.id;

  if (!companyId) {
    throw new Error("기본 범위 생성에 실패했습니다.");
  }

  const domainResult = await client.query(
    `
      insert into domains (domain_name, company_id, status)
      values ('전체', $1, 'ACTIVE')
      on conflict (domain_name) do update
      set company_id = excluded.company_id, status = 'ACTIVE', updated_at = now()
      returning id
    `,
    [companyId],
  );
  const domainId = domainResult.rows[0]?.id;
  const adminResult = await client.query(
    `
      insert into admins (login_id, password_hash, name, role, status)
      values ('master', $1, '마스터 관리자', 'MASTER', 'ACTIVE')
      on conflict (login_id) do update
      set
        password_hash = excluded.password_hash,
        name = excluded.name,
        role = 'MASTER',
        status = 'ACTIVE',
        updated_at = now()
      returning id
    `,
    [passwordHash],
  );
  const adminId = adminResult.rows[0]?.id;

  if (!domainId || !adminId) {
    throw new Error("기본 seed 생성에 실패했습니다.");
  }

  await client.query(
    `
      insert into admin_company_mappings (admin_id, company_id)
      select $1, $2
      where not exists (
        select 1
        from admin_company_mappings
        where admin_id = $1 and company_id = $2
      )
    `,
    [adminId, companyId],
  );
  await client.query(
    `
      insert into fee_rates (
        company_id,
        company_rate,
        distributor_rate,
        agency_rate,
        sub_distributor_rate,
        starts_at,
        created_by
      )
      select $1, 0.4, 0, 0, 0, now(), $2
      where not exists (
        select 1
        from fee_rates
        where company_id = $1 and domain_id is null and distributor_id is null
      )
    `,
    [companyId, adminId],
  );
  await client.query(
    `
      update distributors d
      set name = a.name, status = 'ACTIVE', updated_at = now()
      from admins a
      where d.admin_id = a.id
        and a.role <> 'MASTER'
        and a.status = 'ACTIVE'
    `,
  );
  await client.query(
    `
      insert into distributors (
        company_id,
        admin_id,
        name,
        level,
        current_balance,
        status
      )
      select
        $1,
        a.id,
        a.name,
        case when a.role = 'TOP_DISTRIBUTOR' then 'TOP_DISTRIBUTOR' else 'DISTRIBUTOR' end,
        0,
        'ACTIVE'
      from admins a
      where a.role <> 'MASTER' and a.status = 'ACTIVE'
        and not exists (
          select 1 from distributors d where d.admin_id = a.id
        )
    `,
    [companyId],
  );
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
  const client = await pool.connect();

  try {
    await client.query("begin");

    if (await hasSchema(client)) {
      console.log("Schema already exists. Skipping schema creation.");
    } else {
      await applySchema(client);
      console.log("Schema created.");
    }

    await applySchemaUpgrades(client);
    await seedBaseData(client);
    await client.query("commit");
    console.log("Seeded master account and default scope.");
    console.log("Login ID: master");
    console.log(`Password: ${process.env.MASTER_PASSWORD ?? "0000"}`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

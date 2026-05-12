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
  const client = await pool.connect();

  try {
    await client.query("begin");

    const smokeChargeIds = await client.query(
      `
        select id
        from charge_requests
        where external_id like 'smoke-%' or user_uid like 'user-%'
      `,
    );
    const smokeExchangeIds = await client.query(
      `
        select id
        from exchange_requests
        where external_id like 'exchange-%' or user_uid like 'exchange-user-%'
      `,
    );
    const smokeAdminIds = await client.query(
      `
        select id
        from admins
        where login_id like 'smoke%'
      `,
    );
    const smokeDomainIds = await client.query(
      `
        select id
        from domains
        where domain_name like 'smoke-%.example.com'
      `,
    );

    await client.query(
      `
        delete from distributor_balance_transactions
        where source_id = any($1::uuid[]) or source_id = any($2::uuid[])
      `,
      [
        smokeChargeIds.rows.map((row) => row.id),
        smokeExchangeIds.rows.map((row) => row.id),
      ],
    );
    await client.query(
      `
        delete from commission_records
        where charge_request_id = any($1::uuid[])
      `,
      [smokeChargeIds.rows.map((row) => row.id)],
    );
    await client.query(
      `
        delete from exchange_requests
        where id = any($1::uuid[])
      `,
      [smokeExchangeIds.rows.map((row) => row.id)],
    );
    await client.query(
      `
        delete from charge_requests
        where id = any($1::uuid[])
      `,
      [smokeChargeIds.rows.map((row) => row.id)],
    );
    await client.query(
      `
        delete from bank_accounts
        where
          account_number like '123-456-%'
          or (bank_name = '테스트은행' and account_holder in ('테스트예금주', '환전예금주'))
      `,
    );
    await client.query(
      `
        delete from domains
        where id = any($1::uuid[])
      `,
      [smokeDomainIds.rows.map((row) => row.id)],
    );
    await client.query(
      `
        delete from admin_company_mappings
        where admin_id = any($1::uuid[])
      `,
      [smokeAdminIds.rows.map((row) => row.id)],
    );
    await client.query(
      `
        delete from distributors
        where admin_id = any($1::uuid[])
      `,
      [smokeAdminIds.rows.map((row) => row.id)],
    );
    await client.query(
      `
        delete from admins
        where id = any($1::uuid[]) and role <> 'MASTER'
      `,
      [smokeAdminIds.rows.map((row) => row.id)],
    );

    await client.query("commit");

    console.log("Smoke data cleaned.");
    console.log(`charge_requests: ${smokeChargeIds.rowCount}`);
    console.log(`exchange_requests: ${smokeExchangeIds.rowCount}`);
    console.log(`domains: ${smokeDomainIds.rowCount}`);
    console.log(`admins: ${smokeAdminIds.rowCount}`);
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

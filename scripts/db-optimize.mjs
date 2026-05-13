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

const indexStatements = [
  "alter table admins add column if not exists password_ciphertext text",
  "alter table exchange_requests alter column domain_id drop not null",
  "create index if not exists idx_admins_created_by_status on admins (created_by, status)",
  "create index if not exists idx_distributors_admin_status_created on distributors (admin_id, status, created_at desc)",
  "create index if not exists idx_domains_distributor_status_created on domains (distributor_id, status, created_at desc)",
  "create index if not exists idx_domains_company_status_created on domains (company_id, status, created_at desc)",
  "create index if not exists idx_bank_accounts_lookup on bank_accounts (company_id, distributor_id, is_active, created_at desc)",
  "create index if not exists idx_charge_requests_distributor_requested on charge_requests (distributor_id, requested_at desc, created_at desc)",
  "create index if not exists idx_charge_requests_status_requested on charge_requests (status, requested_at desc)",
  "create index if not exists idx_charge_requests_domain_requested on charge_requests (domain_id, requested_at desc)",
  "create index if not exists idx_exchange_requests_distributor_requested on exchange_requests (distributor_id, requested_at desc)",
  "create index if not exists idx_exchange_requests_status_processed on exchange_requests (status, processed_at desc)",
  "create index if not exists idx_exchange_requests_domain_requested on exchange_requests (domain_id, requested_at desc)",
  "create index if not exists idx_commission_records_distributor_created on commission_records (distributor_id, created_at desc)",
  "create index if not exists idx_commission_records_status_created on commission_records (status, created_at desc)",
  "create index if not exists idx_commission_records_domain_created on commission_records (domain_id, created_at desc)",
  "create index if not exists idx_distributor_withdrawals_distributor_requested on distributor_withdrawals (distributor_id, requested_at desc)",
];

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
    for (const statement of indexStatements) {
      await pool.query(statement);
      console.log(`Applied: ${statement.match(/idx_[a-z0-9_]+/)?.[0] ?? "index"}`);
    }

    console.log("Database indexes optimized.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

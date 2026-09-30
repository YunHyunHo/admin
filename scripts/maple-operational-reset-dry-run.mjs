import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
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

if (!process.argv.includes("--backup")) {
  throw new Error("사용법: node scripts/maple-operational-reset-dry-run.mjs --backup");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL을 확인해주세요.");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

const ids = (rows) => rows.map((row) => String(row.id));
const unique = (values) => [...new Set(values.filter(Boolean))];

async function selectAny(client, table, clauses, values, orderBy = "created_at") {
  const active = clauses
    .map((clause, index) => ({ clause, values: values[index] }))
    .filter((entry) => entry.values.length > 0);
  if (!active.length) return [];
  const where = active
    .map((entry, index) => `${entry.clause} = any($${index + 1}::uuid[])`)
    .join(" or ");
  return (
    await client.query(
      `select * from ${table} where ${where} order by ${orderBy}`,
      active.map((entry) => entry.values),
    )
  ).rows;
}

function publicAccount(row) {
  return {
    id: String(row.id),
    loginId: row.login_id,
    role: row.role,
    status: row.status,
    createdBy: row.created_by ? String(row.created_by) : null,
  };
}

const client = await pool.connect();
let backup;

try {
  await client.query("begin isolation level repeatable read read only");

  const accounts = (
    await client.query(
      `with recursive descendants as (
         select id, login_id, password_hash, password_ciphertext, name,
                role::text role, status::text status, memo, created_by,
                last_login_at, created_at, updated_at, array[id] path, 0 depth
         from admins
         where lower(login_id) = 'maple'
         union all
         select child.id, child.login_id, child.password_hash, child.password_ciphertext,
                child.name, child.role::text, child.status::text, child.memo,
                child.created_by, child.last_login_at, child.created_at, child.updated_at,
                descendants.path || child.id, descendants.depth + 1
         from descendants
         join admins child on child.created_by = descendants.id
         where descendants.depth < 31
           and not child.id = any(descendants.path)
       )
       select * from descendants order by depth, login_id`,
    )
  ).rows;

  const maple = accounts.find((row) => row.login_id.toLowerCase() === "maple");
  if (!maple || maple.role !== "MASTER" || maple.status !== "ACTIVE") {
    throw new Error("ACTIVE 상태의 maple MASTER를 하나로 확정하지 못했습니다.");
  }

  const accountIds = ids(accounts);
  const targetAccounts = accounts.filter((row) => row.id !== maple.id);
  const targetAccountIds = ids(targetAccounts);
  const loginIds = accounts.map((row) => row.login_id.toLowerCase());

  const adminCompanyMappings = await selectAny(
    client,
    "admin_company_mappings",
    ["admin_id"],
    [accountIds],
  );
  const companyIds = unique(adminCompanyMappings.map((row) => String(row.company_id)));
  const companies = companyIds.length
    ? (await client.query(`select * from companies where id = any($1::uuid[]) order by company_name`, [companyIds])).rows
    : [];
  const domains = companyIds.length
    ? (await client.query(`select * from domains where company_id = any($1::uuid[]) order by created_at`, [companyIds])).rows
    : [];
  const domainIds = ids(domains);
  const distributors = (
    await client.query(
      `select distinct *
       from distributors
       where admin_id = any($1::uuid[])
          or company_id = any($2::uuid[])
       order by created_at`,
      [accountIds, companyIds],
    )
  ).rows;
  const distributorIds = ids(distributors);

  const adminDomainMappings = await selectAny(
    client,
    "admin_domain_mappings",
    ["admin_id", "domain_id"],
    [targetAccountIds, domainIds],
  );
  const charges = await selectAny(
    client,
    "charge_requests",
    ["company_id", "domain_id", "distributor_id"],
    [companyIds, domainIds, distributorIds],
  );
  const exchanges = await selectAny(
    client,
    "exchange_requests",
    ["company_id", "domain_id", "distributor_id"],
    [companyIds, domainIds, distributorIds],
  );
  const withdrawals = await selectAny(
    client,
    "distributor_withdrawals",
    ["distributor_id"],
    [distributorIds],
  );
  const chargeIds = ids(charges);
  const exchangeIds = ids(exchanges);
  const withdrawalIds = ids(withdrawals);
  const requestIds = [...chargeIds, ...exchangeIds, ...withdrawalIds];

  const commissionRecords = await selectAny(
    client,
    "commission_records",
    ["charge_request_id", "company_id", "domain_id", "distributor_id"],
    [chargeIds, companyIds, domainIds, distributorIds],
  );
  const balanceTransactions = (
    await client.query(
      `select * from distributor_balance_transactions
       where distributor_id = any($1::uuid[])
          or source_id = any($2::uuid[])
       order by created_at`,
      [distributorIds, requestIds],
    )
  ).rows;
  const domainSettlements = await selectAny(
    client,
    "domain_settlements",
    ["company_id", "domain_id", "distributor_id"],
    [companyIds, domainIds, distributorIds],
  );
  const distributorSettlements = await selectAny(
    client,
    "distributor_settlements",
    ["company_id", "domain_id", "distributor_id"],
    [companyIds, domainIds, distributorIds],
  );
  const bankAccounts = await selectAny(
    client,
    "bank_accounts",
    ["company_id", "distributor_id", "created_by"],
    [companyIds, distributorIds, targetAccountIds],
  );
  const feeRates = (
    await client.query(
      `select * from fee_rates
       where company_id = any($1::uuid[])
          or domain_id = any($2::uuid[])
          or distributor_id = any($3::uuid[])
          or sub_distributor_id = any($3::uuid[])
          or created_by = any($4::uuid[])
       order by created_at`,
      [companyIds, domainIds, distributorIds, targetAccountIds],
    )
  ).rows;
  const feeRateIds = ids(feeRates);
  const feeRatePartners = (
    await client.query(
      `select * from fee_rate_partners
       where fee_rate_id = any($1::uuid[])
          or distributor_id = any($2::uuid[])
       order by created_at`,
      [feeRateIds, distributorIds],
    )
  ).rows;
  const telegramSettings = await selectAny(
    client,
    "telegram_company_settings",
    ["company_id", "domain_id", "configured_by"],
    [companyIds, domainIds, targetAccountIds],
  );
  const integrations = await selectAny(
    client,
    "domain_charge_integrations",
    ["domain_id"],
    [domainIds],
  );
  const refreshTokens = (
    await client.query(
      `select * from partner_refresh_tokens
       where admin_id = any($1::uuid[])
          or domain_id = any($2::uuid[])
       order by created_at`,
      [targetAccountIds, domainIds],
    )
  ).rows;
  const realtimeFlags = (
    await client.query(
      `select * from realtime_account_flags
       where lower(login_id) = any($1::text[])
       order by environment, login_id`,
      [loginIds],
    )
  ).rows;

  const resourceIds = unique([
    ...companyIds,
    ...domainIds,
    ...distributorIds,
    ...requestIds,
  ]);
  const auditLogs = (
    await client.query(
      `select * from admin_audit_logs
       where admin_id = any($1::uuid[])
          or resource_id = any($2::uuid[])
       order by created_at`,
      [accountIds, resourceIds],
    )
  ).rows;
  const outboxEvents = (
    await client.query(
      `select * from admin_request_event_log
       where event->>'companyId' = any($1::text[])
          or event->>'domainId' = any($2::text[])
          or event->>'distributorId' = any($3::text[])
          or event->>'requestId' = any($4::text[])
       order by id`,
      [companyIds, domainIds, distributorIds, requestIds],
    )
  ).rows;
  const globalEvent = (
    await client.query(
      `select coalesce(max(id), 0)::text latest_event_id,
              count(*)::int total_events,
              max(created_at) latest_created_at
       from admin_request_event_log`,
    )
  ).rows[0];

  const crossGroupMappings = (
    await client.query(
      `select 'company' kind, a.id::text admin_id, a.login_id, m.company_id::text target_id
       from admin_company_mappings m
       join admins a on a.id = m.admin_id
       where m.company_id = any($1::uuid[])
         and a.id <> all($2::uuid[])
       union all
       select 'domain', a.id::text, a.login_id, m.domain_id::text
       from admin_domain_mappings m
       join admins a on a.id = m.admin_id
       where m.domain_id = any($3::uuid[])
         and a.id <> all($2::uuid[])`,
      [companyIds, accountIds, domainIds],
    )
  ).rows;

  const activeTargetAccounts = targetAccounts.filter((row) => row.status !== "DELETED");
  const deletedTombstones = targetAccounts.filter((row) => row.status === "DELETED");
  const pending = {
    charges: charges.filter((row) => row.status === "PENDING").length,
    exchanges: exchanges.filter((row) => row.status === "PENDING").length,
    withdrawals: withdrawals.filter((row) => row.status === "PENDING").length,
  };
  const balances = {
    domains: domains.map((row) => ({
      id: String(row.id),
      currentBalance: String(row.current_balance ?? "0"),
    })),
    distributors: distributors.map((row) => ({
      id: String(row.id),
      currentBalance: String(row.current_balance ?? "0"),
    })),
    domainTotal: domains
      .reduce((total, row) => total + BigInt(row.current_balance ?? 0), 0n)
      .toString(),
    distributorTotal: distributors
      .reduce((total, row) => total + BigInt(row.current_balance ?? 0), 0n)
      .toString(),
  };

  const counts = {
    activeTargetAccounts: activeTargetAccounts.length,
    existingDeletedTombstones: deletedTombstones.length,
    companies: companies.length,
    domains: domains.length,
    distributors: distributors.length,
    charges: charges.length,
    exchanges: exchanges.length,
    withdrawals: withdrawals.length,
    commissionRecords: commissionRecords.length,
    balanceTransactions: balanceTransactions.length,
    domainSettlements: domainSettlements.length,
    distributorSettlements: distributorSettlements.length,
    bankAccounts: bankAccounts.length,
    feeRates: feeRates.length,
    feeRatePartners: feeRatePartners.length,
    telegramSettings: telegramSettings.length,
    integrations: integrations.length,
    refreshTokens: refreshTokens.length,
    activeRefreshTokens: refreshTokens.filter((row) => row.status === "ACTIVE").length,
    revokedRefreshTokens: refreshTokens.filter((row) => row.status === "REVOKED").length,
    realtimeFlags: realtimeFlags.length,
    preservedAuditLogs: auditLogs.length,
    preservedOutboxEvents: outboxEvents.length,
    otherMasterImpact: crossGroupMappings.length,
  };

  backup = {
    schemaVersion: 1,
    purpose: "maple-operational-reset-preflight-backup",
    createdAt: new Date().toISOString(),
    transactionMode: "REPEATABLE READ / READ ONLY",
    currentGlobalEvent: globalEvent,
    protected: {
      mapleAccount: maple,
      auditLogs,
      outboxEvents,
    },
    targets: {
      accounts: targetAccounts,
      companies,
      domains,
      distributors,
      adminCompanyMappings,
      adminDomainMappings,
      charges,
      exchanges,
      withdrawals,
      commissionRecords,
      balanceTransactions,
      domainSettlements,
      distributorSettlements,
      bankAccounts,
      feeRates,
      feeRatePartners,
      telegramSettings,
      integrations,
      refreshTokens,
      realtimeFlags,
    },
    dryRun: {
      counts,
      pending,
      balances,
      expectedAfterReset: {
        activeMapleChildren: 0,
        companies: 0,
        domains: 0,
        distributors: 0,
        charges: 0,
        exchanges: 0,
        withdrawals: 0,
        pending: 0,
        balance: "0",
        activeDeletedAccountTokens: 0,
      },
      crossGroupMappings,
    },
  };

  await client.query("rollback");

  const backupDirectory = path.resolve("backups");
  await mkdir(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `${timestamp}-maple-operational-reset-preflight`;
  const encryptedPath = path.join(backupDirectory, `${baseName}.json.enc`);
  const keyPath = path.join(backupDirectory, `${baseName}.key`);
  const manifestPath = path.join(backupDirectory, `${baseName}-dry-run.json`);

  const plaintext = Buffer.from(JSON.stringify(backup), "utf8");
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };

  await writeFile(encryptedPath, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
  await writeFile(keyPath, `${key.toString("hex")}\n`, { mode: 0o600 });

  const publicManifest = {
    createdAt: backup.createdAt,
    currentGlobalEvent: globalEvent,
    targets: {
      activeAccounts: activeTargetAccounts.map(publicAccount),
      deletedTombstones: deletedTombstones.map(publicAccount),
      companies: companies.map((row) => ({ id: String(row.id), name: row.company_name, status: row.status })),
      domains: domains.map((row) => ({ id: String(row.id), companyId: String(row.company_id), status: row.status })),
      distributors: distributors.map((row) => ({ id: String(row.id), name: row.name, level: row.level, status: row.status })),
    },
    counts,
    pending,
    balances,
    expectedAfterReset: backup.dryRun.expectedAfterReset,
    crossGroupMappings,
    protectedCounts: {
      auditLogs: auditLogs.length,
      outboxEvents: outboxEvents.length,
      globalOutboxRows: globalEvent.total_events,
    },
  };
  await writeFile(manifestPath, `${JSON.stringify(publicManifest, null, 2)}\n`, { mode: 0o600 });
  await Promise.all([encryptedPath, keyPath, manifestPath].map((file) => chmod(file, 0o600)));

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const restored = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  if (createHash("sha256").update(restored).digest("hex") !== createHash("sha256").update(plaintext).digest("hex")) {
    throw new Error("암호화 백업 복원 검증에 실패했습니다.");
  }

  console.log(JSON.stringify({
    status: "backup-created-and-dry-run-complete",
    encryptedBackup: encryptedPath,
    recoveryKey: keyPath,
    publicManifest: manifestPath,
    sha256: createHash("sha256").update(plaintext).digest("hex"),
    counts,
    pending,
    currentGlobalEvent: globalEvent,
    otherMasterImpact: crossGroupMappings.length,
    databaseMutations: 0,
  }, null, 2));
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}

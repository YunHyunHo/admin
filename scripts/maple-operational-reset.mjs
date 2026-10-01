import { randomBytes, scryptSync } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
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

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() ?? "" : "";
}

const execute = process.argv.includes("--execute");
const confirmation = argument("--confirm");
const manifestPath = path.resolve(argument("--backup-manifest"));
const expectedActive = Number(argument("--expected-active"));

if (!execute || confirmation !== "MAPLE_OPERATIONAL_RESET") {
  throw new Error("실행하려면 --execute --confirm MAPLE_OPERATIONAL_RESET가 필요합니다.");
}
if (!manifestPath || !Number.isInteger(expectedActive) || expectedActive < 1) {
  throw new Error("--backup-manifest와 --expected-active를 확인해주세요.");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL을 확인해주세요.");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.counts?.activeTargetAccounts !== expectedActive) {
  throw new Error("백업 manifest의 ACTIVE 대상 계정 수가 승인값과 다릅니다.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

const ids = (rows) => rows.map((row) => String(row.id));
const unique = (values) => [...new Set(values.filter(Boolean))];
const sameSet = (left, right) =>
  left.length === right.length && left.every((value) => new Set(right).has(value));

function tombstonePassword() {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(randomBytes(32), salt, 64).toString("hex");
  return `scrypt$${salt}$${key}`;
}

async function rowsByAny(client, table, clauses, values, suffix = "") {
  const active = clauses
    .map((clause, index) => ({ clause, values: values[index] }))
    .filter((entry) => entry.values.length > 0);
  if (!active.length) return [];
  const where = active
    .map((entry, index) => `${entry.clause} = any($${index + 1}::uuid[])`)
    .join(" or ");
  return (
    await client.query(
      `select * from ${table} where ${where} ${suffix}`,
      active.map((entry) => entry.values),
    )
  ).rows;
}

async function deleteIds(client, table, rowIds) {
  if (!rowIds.length) return 0;
  return (await client.query(`delete from ${table} where id = any($1::uuid[])`, [rowIds])).rowCount;
}

const client = await pool.connect();
let committed;

try {
  await client.query("begin isolation level serializable");
  await client.query("set local lock_timeout = '20s'");
  await client.query("set local statement_timeout = '120s'");
  await client.query("select pg_advisory_xact_lock(hashtext('maple-operational-reset'))");

  const accounts = (
    await client.query(
      `with recursive descendants as (
         select id, login_id, role::text role, status::text status, created_by,
                array[id] path, 0 depth
         from admins
         where lower(login_id) = 'maple'
         union all
         select child.id, child.login_id, child.role::text, child.status::text,
                child.created_by, descendants.path || child.id, descendants.depth + 1
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
    throw new Error("ACTIVE maple MASTER를 확정하지 못했습니다.");
  }

  const targets = accounts.filter((row) => row.id !== maple.id);
  const activeTargets = targets.filter((row) => row.status !== "DELETED");
  const targetIds = ids(targets);
  const accountIds = ids(accounts);
  const approvedTargetIds = manifest.targets.activeAccounts
    .concat(manifest.targets.deletedTombstones)
    .map((row) => String(row.id));
  if (activeTargets.length !== expectedActive || !sameSet(targetIds, approvedTargetIds)) {
    throw new Error("현재 Maple 하위 계정이 승인된 최신 백업 범위와 다릅니다.");
  }

  await client.query(`select id from admins where id = any($1::uuid[]) for update`, [accountIds]);

  const adminCompanyMappings = await rowsByAny(
    client,
    "admin_company_mappings",
    ["admin_id"],
    [accountIds],
  );
  const mappedCompanyIds = unique(adminCompanyMappings.map((row) => String(row.company_id)));
  const sharedCompanyIds = mappedCompanyIds.length
    ? (
        await client.query(
          `select distinct m.company_id::text id
           from admin_company_mappings m
           where m.company_id = any($1::uuid[])
             and m.admin_id <> all($2::uuid[])`,
          [mappedCompanyIds, accountIds],
        )
      ).rows.map((row) => String(row.id))
    : [];
  const companyIds = mappedCompanyIds.filter((id) => !sharedCompanyIds.includes(id));
  const companies = companyIds.length
    ? (await client.query(`select * from companies where id = any($1::uuid[]) for update`, [companyIds])).rows
    : [];
  const sharedCompanies = sharedCompanyIds.length
    ? (await client.query(`select * from companies where id = any($1::uuid[])`, [sharedCompanyIds])).rows
    : [];
  const mappedDomainIds = targetIds.length
    ? (
        await client.query(
          `select distinct domain_id::text id
           from admin_domain_mappings
           where admin_id = any($1::uuid[])`,
          [targetIds],
        )
      ).rows.map((row) => String(row.id))
    : [];
  const domains = companyIds.length || mappedDomainIds.length
    ? (
        await client.query(
          `select * from domains
           where company_id = any($1::uuid[])
              or id = any($2::uuid[])
           for update`,
          [companyIds, mappedDomainIds],
        )
      ).rows
    : [];
  const domainIds = ids(domains);
  const distributors = (
    await client.query(
      `select * from distributors
       where admin_id = any($1::uuid[]) or company_id = any($2::uuid[])
       for update`,
      [targetIds, companyIds],
    )
  ).rows;
  const distributorIds = ids(distributors);

  const crossGroup = (
    await client.query(
      `select 'company-admin' kind, a.login_id subject, m.company_id::text target
       from admin_company_mappings m join admins a on a.id = m.admin_id
       where m.company_id = any($1::uuid[]) and a.id <> all($2::uuid[])
       union all
       select 'domain-admin', a.login_id, m.domain_id::text
       from admin_domain_mappings m join admins a on a.id = m.admin_id
       where m.domain_id = any($3::uuid[]) and a.id <> all($2::uuid[])
       union all
       select 'external-distributor-child', d.name, d.parent_distributor_id::text
       from distributors d
       where d.parent_distributor_id = any($4::uuid[]) and d.id <> all($4::uuid[])
       union all
       select 'external-domain-distributor', d.id::text, d.distributor_id::text
       from domains d
       where d.distributor_id = any($4::uuid[]) and d.id <> all($3::uuid[])`,
      [companyIds, accountIds, domainIds, distributorIds],
    )
  ).rows;
  if (crossGroup.length) {
    throw new Error(`다른 그룹 참조 ${crossGroup.length}건이 발견되어 중단했습니다.`);
  }

  const charges = await rowsByAny(
    client,
    "charge_requests",
    ["company_id", "domain_id", "distributor_id"],
    [companyIds, domainIds, distributorIds],
  );
  const exchanges = await rowsByAny(
    client,
    "exchange_requests",
    ["company_id", "domain_id", "distributor_id"],
    [companyIds, domainIds, distributorIds],
  );
  const withdrawals = await rowsByAny(
    client,
    "distributor_withdrawals",
    ["distributor_id"],
    [distributorIds],
  );
  const chargeIds = ids(charges);
  const exchangeIds = ids(exchanges);
  const withdrawalIds = ids(withdrawals);
  const requestIds = [...chargeIds, ...exchangeIds, ...withdrawalIds];
  const commissionRecords = await rowsByAny(
    client,
    "commission_records",
    ["charge_request_id", "company_id", "domain_id", "distributor_id"],
    [chargeIds, companyIds, domainIds, distributorIds],
  );
  const balanceTransactions = (
    await client.query(
      `select * from distributor_balance_transactions
       where distributor_id = any($1::uuid[]) or source_id = any($2::uuid[])`,
      [distributorIds, requestIds],
    )
  ).rows;
  const domainSettlements = await rowsByAny(
    client,
    "domain_settlements",
    ["company_id", "domain_id", "distributor_id"],
    [companyIds, domainIds, distributorIds],
  );
  const distributorSettlements = await rowsByAny(
    client,
    "distributor_settlements",
    ["company_id", "domain_id", "distributor_id"],
    [companyIds, domainIds, distributorIds],
  );
  const bankAccounts = await rowsByAny(
    client,
    "bank_accounts",
    ["company_id", "distributor_id", "created_by"],
    [companyIds, distributorIds, targetIds],
  );
  const feeRates = (
    await client.query(
      `select * from fee_rates
       where company_id = any($1::uuid[])
          or domain_id = any($2::uuid[])
          or distributor_id = any($3::uuid[])
          or sub_distributor_id = any($3::uuid[])
          or created_by = any($4::uuid[])`,
      [companyIds, domainIds, distributorIds, targetIds],
    )
  ).rows;
  const feeRateIds = ids(feeRates);
  const feeRatePartners = (
    await client.query(
      `select * from fee_rate_partners
       where fee_rate_id = any($1::uuid[]) or distributor_id = any($2::uuid[])`,
      [feeRateIds, distributorIds],
    )
  ).rows;
  const telegramSettings = await rowsByAny(
    client,
    "telegram_company_settings",
    ["company_id", "domain_id", "configured_by"],
    [companyIds, domainIds, targetIds],
  );
  const integrations = await rowsByAny(
    client,
    "domain_charge_integrations",
    ["domain_id"],
    [domainIds],
  );
  const refreshTokens = (
    await client.query(
      `select * from partner_refresh_tokens
       where admin_id = any($1::uuid[]) or domain_id = any($2::uuid[])`,
      [targetIds, domainIds],
    )
  ).rows;
  const childFlags = (
    await client.query(
      `select environment, login_id from realtime_account_flags
       where lower(login_id) = any($1::text[])`,
      [targets.map((row) => row.login_id.toLowerCase())],
    )
  ).rows;

  const currentCounts = {
    activeTargetAccounts: activeTargets.length,
    existingDeletedTombstones: targets.length - activeTargets.length,
    companies: companies.length,
    sharedCompaniesPreserved: sharedCompanies.length,
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
  };
  for (const [key, value] of Object.entries(currentCounts)) {
    if (manifest.counts?.[key] !== value) {
      throw new Error(`${key} 건수가 최신 백업과 달라 중단했습니다: ${manifest.counts?.[key]} -> ${value}`);
    }
  }

  const deleted = {};
  deleted.refreshTokens = await deleteIds(client, "partner_refresh_tokens", ids(refreshTokens));
  deleted.integrations = await deleteIds(client, "domain_charge_integrations", ids(integrations));
  deleted.telegramSettings = await deleteIds(client, "telegram_company_settings", ids(telegramSettings));
  deleted.feeRatePartners = await deleteIds(client, "fee_rate_partners", ids(feeRatePartners));
  deleted.commissionRecords = await deleteIds(client, "commission_records", ids(commissionRecords));
  deleted.balanceTransactions = await deleteIds(client, "distributor_balance_transactions", ids(balanceTransactions));
  deleted.domainSettlements = await deleteIds(client, "domain_settlements", ids(domainSettlements));
  deleted.distributorSettlements = await deleteIds(client, "distributor_settlements", ids(distributorSettlements));
  deleted.withdrawals = await deleteIds(client, "distributor_withdrawals", withdrawalIds);
  deleted.exchanges = await deleteIds(client, "exchange_requests", exchangeIds);
  deleted.charges = await deleteIds(client, "charge_requests", chargeIds);
  deleted.feeRates = await deleteIds(client, "fee_rates", feeRateIds);
  deleted.adminDomainMappings = (
    await client.query(
      `delete from admin_domain_mappings
       where admin_id = any($1::uuid[]) or domain_id = any($2::uuid[])`,
      [targetIds, domainIds],
    )
  ).rowCount;
  deleted.adminCompanyMappings = (
    await client.query(
      `delete from admin_company_mappings
       where admin_id = any($1::uuid[]) or company_id = any($2::uuid[])`,
      [targetIds, companyIds],
    )
  ).rowCount;
  deleted.domains = await deleteIds(client, "domains", domainIds);
  deleted.bankAccounts = await deleteIds(client, "bank_accounts", ids(bankAccounts));
  deleted.distributors = await deleteIds(client, "distributors", distributorIds);
  deleted.companies = await deleteIds(client, "companies", companyIds);
  deleted.realtimeFlags = childFlags.length
    ? (
        await client.query(
          `delete from realtime_account_flags
           where lower(login_id) = any($1::text[])`,
          [targets.map((row) => row.login_id.toLowerCase())],
        )
      ).rowCount
    : 0;

  const resetAt = new Date().toISOString();
  const tombstoned = (
    await client.query(
      `update admins
       set status = 'DELETED',
           password_hash = $2::text,
           password_ciphertext = null,
           created_by = null,
           last_login_at = null,
           memo = concat_ws(E'\n', nullif(memo, ''), $3::text),
           updated_at = now()
       where id = any($1::uuid[])
       returning id::text`,
      [targetIds, tombstonePassword(), `Maple 운영 전환 초기화 ${resetAt}`],
    )
  ).rows;
  if (tombstoned.length !== targets.length) {
    throw new Error("계정 tombstone 건수가 일치하지 않습니다.");
  }

  await client.query(
    `insert into admin_audit_logs (
       admin_id, action, resource_type, resource_id, before_data, after_data
     ) values ($1::uuid, 'maple_operational_reset', 'admin_group', $1::uuid, $2::jsonb, $3::jsonb)`,
    [
      maple.id,
      JSON.stringify({ manifestCreatedAt: manifest.createdAt, currentCounts }),
      JSON.stringify({ resetAt, tombstonedAccounts: tombstoned.length, deleted }),
    ],
  );

  await client.query("commit");
  committed = { mapleId: String(maple.id), targetIds, companyIds, domainIds, distributorIds, chargeIds, exchangeIds, withdrawalIds, currentCounts, deleted, resetAt };
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
}

try {
  const baseline = (
    await pool.query(
      `select coalesce(max(id), 0)::text baseline_event_id,
              count(*)::int total_events
       from admin_request_event_log`,
    )
  ).rows[0];
  await pool.query(`
    create table if not exists realtime_account_baselines (
      environment text not null,
      login_id text not null,
      baseline_event_id bigint not null,
      updated_at timestamptz not null default now(),
      primary key (environment, login_id)
    )
  `);
  await pool.query(
    `insert into realtime_account_baselines (environment, login_id, baseline_event_id, updated_at)
     select environment, 'maple', $1::bigint, now()
     from unnest(array['preview'::text, 'production'::text]) environment
     on conflict (environment, login_id)
     do update set baseline_event_id = excluded.baseline_event_id, updated_at = now()`,
    [baseline.baseline_event_id],
  );

  const verification = (
    await pool.query(
      `select
         (select count(*)::int from admins where id = any($1::uuid[]) and status = 'DELETED' and created_by is null and password_ciphertext is null) tombstoned_accounts,
         (select count(*)::int from admins where created_by = $2::uuid and status <> 'DELETED') active_children,
         (select count(*)::int from companies where id = any($3::uuid[])) companies,
         (select count(*)::int from domains where id = any($4::uuid[])) domains,
         (select count(*)::int from distributors where id = any($5::uuid[])) distributors,
         (select count(*)::int from charge_requests where id = any($6::uuid[])) charges,
         (select count(*)::int from exchange_requests where id = any($7::uuid[])) exchanges,
         (select count(*)::int from distributor_withdrawals where id = any($8::uuid[])) withdrawals,
         (select count(*)::int from partner_refresh_tokens where admin_id = any($1::uuid[])) refresh_tokens,
         (select count(*)::int from realtime_account_flags where lower(login_id) = any(
           select lower(login_id) from admins where id = any($1::uuid[])
         )) child_realtime_flags,
         (select count(*)::int from admin_audit_logs where admin_id = any(array[$2::uuid] || $1::uuid[])) preserved_audit_logs,
         (select count(*)::int from admin_request_event_log) preserved_outbox_rows,
         (select status::text from admins where id = $2::uuid) maple_status`,
      [committed.targetIds, committed.mapleId, committed.companyIds, committed.domainIds, committed.distributorIds, committed.chargeIds, committed.exchangeIds, committed.withdrawalIds],
    )
  ).rows[0];
  const baselines = (
    await pool.query(
      `select environment, login_id, baseline_event_id::text, updated_at
       from realtime_account_baselines where login_id = 'maple' order by environment`,
    )
  ).rows;

  const receipt = {
    status: "maple-operational-reset-committed",
    ...committed,
    baseline,
    baselines,
    verification,
    preserved: { auditLogs: true, outbox: true, globalSequence: true },
  };
  const receiptPath = path.resolve(
    "backups",
    `${new Date().toISOString().replace(/[:.]/g, "-")}-maple-operational-reset-receipt.json`,
  );
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await chmod(receiptPath, 0o600);
  console.log(JSON.stringify({ ...receipt, receiptPath }, null, 2));
} finally {
  await pool.end();
}

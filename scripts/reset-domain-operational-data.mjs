import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");

async function loadLocalEnv() {
  try {
    const envText = await readFile(path.join(projectDirectory, ".env.local"), "utf8");

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

function getArgument(name) {
  const index = process.argv.indexOf(name);

  return index === -1 ? "" : process.argv[index + 1]?.trim() ?? "";
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL 환경변수가 필요합니다.");
  }

  return databaseUrl;
}

function toSafeFilename(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "domain";
}

function groupLedgerImpact(rows) {
  const impactByDistributor = new Map();

  for (const row of rows) {
    const distributorId = String(row.distributor_id);
    const previous = impactByDistributor.get(distributorId) ?? 0;
    impactByDistributor.set(distributorId, previous + Number(row.amount));
  }

  return impactByDistributor;
}

async function selectTargetDomain(client, masterLogin, domainLabel) {
  const result = await client.query(
    `
      select
        dom.*,
        c.company_name,
        master_admin.id::text as master_admin_id,
        master_admin.login_id as master_login
      from domains dom
      join companies c on c.id = dom.company_id
      join admins master_admin
        on master_admin.login_id = $1
        and master_admin.role = 'MASTER'
        and master_admin.status = 'ACTIVE'
      left join distributors dist on dist.id = dom.distributor_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
      where dom.status <> 'DELETED'
        and (
          dom.id::text = $2
          or dom.domain_name = $2
          or c.company_name = $2
        )
        and (
          dist_admin.created_by = master_admin.id
          or exists (
            select 1
            from admin_company_mappings acm
            join admins domain_admin on domain_admin.id = acm.admin_id
            where acm.company_id = dom.company_id
              and domain_admin.created_by = master_admin.id
              and domain_admin.role = 'DOMAIN_ADMIN'
              and domain_admin.status <> 'DELETED'
          )
        )
      order by dom.created_at
    `,
    [masterLogin, domainLabel],
  );

  if (result.rows.length !== 1) {
    throw new Error(
      `초기화 대상 도메인을 하나로 확정하지 못했습니다. 검색 결과: ${result.rows.length}건`,
    );
  }

  return result.rows[0];
}

async function selectRowsForBackup(client, domainId, cutoff) {
  const chargeRequests = (
    await client.query(
      `select * from charge_requests where domain_id = $1::uuid and created_at < $2 order by created_at for update`,
      [domainId, cutoff],
    )
  ).rows;
  const exchangeRequests = (
    await client.query(
      `select * from exchange_requests where domain_id = $1::uuid and created_at < $2 order by created_at for update`,
      [domainId, cutoff],
    )
  ).rows;
  const chargeIds = chargeRequests.map((row) => row.id);
  const exchangeIds = exchangeRequests.map((row) => row.id);
  const commissionRecords = chargeIds.length
    ? (
        await client.query(
          `select * from commission_records where charge_request_id = any($1::uuid[]) order by created_at`,
          [chargeIds],
        )
      ).rows
    : [];
  const ledgerSourceIds = [...chargeIds, ...exchangeIds];
  const distributorBalanceTransactions = ledgerSourceIds.length
    ? (
        await client.query(
          `select * from distributor_balance_transactions where source_id = any($1::uuid[]) order by created_at`,
          [ledgerSourceIds],
        )
      ).rows
    : [];
  const domainSettlements = (
    await client.query(
      `select * from domain_settlements where domain_id = $1::uuid and created_at < $2 order by created_at`,
      [domainId, cutoff],
    )
  ).rows;
  const distributorSettlements = (
    await client.query(
      `select * from distributor_settlements where domain_id = $1::uuid and created_at < $2 order by created_at`,
      [domainId, cutoff],
    )
  ).rows;
  const auditLogs = (
    await client.query(
      `
        select *
        from admin_audit_logs
        where resource_type = 'domain'
          and resource_id = $1::uuid
          and created_at < $2
          and action = any($3::text[])
        order by created_at
      `,
      [
        domainId,
        cutoff,
        [
          "charge_request_approved",
          "charge_request_rejected_after_approval",
          "domain_balance_adjustment",
          "domain_exchange_approved",
          "domain_exchange_canceled",
        ],
      ],
    )
  ).rows;
  const feeRates = (
    await client.query(`select * from fee_rates where domain_id = $1::uuid order by created_at`, [
      domainId,
    ])
  ).rows;
  const feeRateIds = feeRates.map((row) => row.id);
  const feeRatePartners = feeRateIds.length
    ? (
        await client.query(
          `select * from fee_rate_partners where fee_rate_id = any($1::uuid[]) order by fee_rate_id, position`,
          [feeRateIds],
        )
      ).rows
    : [];
  const integrations = (
    await client.query(
      `
        select id, master_admin_id, domain_id, label, api_key_prefix, status, created_at, updated_at, revoked_at
        from domain_charge_integrations
        where domain_id = $1::uuid
        order by created_at
      `,
      [domainId],
    )
  ).rows;

  return {
    chargeRequests,
    exchangeRequests,
    commissionRecords,
    distributorBalanceTransactions,
    domainSettlements,
    distributorSettlements,
    auditLogs,
    preservedSettings: {
      feeRates,
      feeRatePartners,
      integrations,
    },
  };
}

function getCounts(data) {
  return {
    chargeRequests: data.chargeRequests.length,
    exchangeRequests: data.exchangeRequests.length,
    commissionRecords: data.commissionRecords.length,
    distributorBalanceTransactions: data.distributorBalanceTransactions.length,
    domainSettlements: data.domainSettlements.length,
    distributorSettlements: data.distributorSettlements.length,
    auditLogs: data.auditLogs.length,
  };
}

async function main() {
  await loadLocalEnv();

  const masterLogin = getArgument("--master");
  const domainLabel = getArgument("--domain");
  const execute = process.argv.includes("--execute");
  const confirmation = getArgument("--confirm");

  if (!masterLogin || !domainLabel) {
    throw new Error(
      "사용법: node scripts/reset-domain-operational-data.mjs --master <마스터ID> --domain <도메인ID|이름> [--execute --confirm RESET_DOMAIN_DATA]",
    );
  }

  if (execute && confirmation !== "RESET_DOMAIN_DATA") {
    throw new Error("실행하려면 --confirm RESET_DOMAIN_DATA가 필요합니다.");
  }

  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  let backupPath = "";

  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '10s'");

    const target = await selectTargetDomain(client, masterLogin, domainLabel);
    await client.query(`select id from domains where id = $1::uuid for update`, [target.id]);
    const cutoff = (await client.query(`select clock_timestamp() as cutoff`)).rows[0].cutoff;
    const data = await selectRowsForBackup(client, target.id, cutoff);
    const counts = getCounts(data);

    if (!execute) {
      await client.query("rollback");
      console.log(
        JSON.stringify(
          {
            mode: "dry-run",
            cutoff,
            target: {
              id: target.id,
              companyName: target.company_name,
              masterLogin: target.master_login,
              currentBalance: target.current_balance,
            },
            counts,
            preservedIntegrations: data.preservedSettings.integrations,
          },
          null,
          2,
        ),
      );
      return;
    }

    const timestamp = new Date(cutoff).toISOString().replace(/[:.]/g, "-");
    const backupDirectory = path.join(projectDirectory, "backups");
    backupPath = path.join(
      backupDirectory,
      `${timestamp}-${toSafeFilename(masterLogin)}-${toSafeFilename(domainLabel)}-operational-data.json`,
    );
    const backup = {
      status: "backup-created-before-reset",
      cutoff,
      target,
      counts,
      data,
    };

    await mkdir(backupDirectory, { recursive: true });
    await writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, { mode: 0o600 });
    await chmod(backupPath, 0o600);

    const ledgerImpact = groupLedgerImpact(data.distributorBalanceTransactions);

    for (const [distributorId, amount] of ledgerImpact) {
      await client.query(`select id from distributors where id = $1::uuid for update`, [
        distributorId,
      ]);
      await client.query(
        `
          update distributors
          set current_balance = greatest(current_balance - $2, 0),
              updated_at = now()
          where id = $1::uuid
        `,
        [distributorId, amount],
      );
    }

    const deleteByIds = async (table, rows) => {
      const ids = rows.map((row) => row.id);

      if (!ids.length) {
        return 0;
      }

      return (
        await client.query(`delete from ${table} where id = any($1::uuid[])`, [ids])
      ).rowCount;
    };

    const deleted = {
      distributorBalanceTransactions: await deleteByIds(
        "distributor_balance_transactions",
        data.distributorBalanceTransactions,
      ),
      commissionRecords: await deleteByIds("commission_records", data.commissionRecords),
      domainSettlements: await deleteByIds("domain_settlements", data.domainSettlements),
      distributorSettlements: await deleteByIds(
        "distributor_settlements",
        data.distributorSettlements,
      ),
      exchangeRequests: await deleteByIds("exchange_requests", data.exchangeRequests),
      chargeRequests: await deleteByIds("charge_requests", data.chargeRequests),
      auditLogs: await deleteByIds("admin_audit_logs", data.auditLogs),
    };

    await client.query(
      `update domains set current_balance = 0, updated_at = now() where id = $1::uuid`,
      [target.id],
    );
    await client.query("commit");

    const verification = (
      await pool.query(
        `
          select
            (select count(*)::int from charge_requests where domain_id = $1::uuid and created_at < $2) as old_charge_requests,
            (select count(*)::int from charge_requests where domain_id = $1::uuid and created_at >= $2) as new_charge_requests,
            (select count(*)::int from exchange_requests where domain_id = $1::uuid and created_at < $2) as old_exchange_requests,
            (select count(*)::int from exchange_requests where domain_id = $1::uuid and created_at >= $2) as new_exchange_requests,
            (select count(*)::int from commission_records where domain_id = $1::uuid and created_at < $2) as old_commission_records,
            (select count(*)::int from domain_settlements where domain_id = $1::uuid and created_at < $2) as old_domain_settlements,
            (select current_balance::text from domains where id = $1::uuid) as current_balance,
            (select count(*)::int from domain_charge_integrations where domain_id = $1::uuid and status = 'ACTIVE') as active_integrations
        `,
        [target.id, cutoff],
      )
    ).rows[0];
    const completedBackup = {
      ...backup,
      status: "reset-committed",
      deleted,
      verification,
    };

    await writeFile(backupPath, `${JSON.stringify(completedBackup, null, 2)}\n`, { mode: 0o600 });
    console.log(
      JSON.stringify(
        {
          mode: "execute",
          cutoff,
          backupPath,
          counts,
          deleted,
          verification,
          preservedIntegrations: data.preservedSettings.integrations,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});

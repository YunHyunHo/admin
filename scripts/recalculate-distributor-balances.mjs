import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

async function loadLocalEnv() {
  try {
    const envText = await readFile(new URL("../.env.local", import.meta.url), "utf8");

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

const desiredBalanceSql = `
  with split_commission_charges as (
    select distinct source_id
    from distributor_balance_transactions
    where source_type in (
      'COMMISSION_TOP_DISTRIBUTOR',
      'COMMISSION_DISTRIBUTOR',
      'COMMISSION_SUB_DISTRIBUTOR'
    )
  ),
  commission_parts as (
    select
      t.distributor_id,
      t.amount
    from distributor_balance_transactions t
    join charge_requests cr on cr.id = t.source_id
    where t.source_type in (
      'COMMISSION_TOP_DISTRIBUTOR',
      'COMMISSION_DISTRIBUTOR',
      'COMMISSION_SUB_DISTRIBUTOR'
    )
      and t.amount > 0
      and cr.status in ('APPROVED', 'COMPLETED')

    union all

    select
      coalesce(parent_dist.id, dist.id) as distributor_id,
      co.distributor_fee as amount
    from commission_records co
    join distributors dist on dist.id = co.distributor_id
    left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
    where co.status in ('APPROVED', 'COMPLETED')
      and not exists (
        select 1
        from split_commission_charges split
        where split.source_id = co.charge_request_id
      )

    union all

    select
      dist.id as distributor_id,
      greatest(co.saved_commission - co.company_fee - co.distributor_fee, 0) as amount
    from commission_records co
    join distributors dist on dist.id = co.distributor_id
    left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
    where co.status in ('APPROVED', 'COMPLETED')
      and parent_dist.id is not null
      and not exists (
        select 1
        from split_commission_charges split
        where split.source_id = co.charge_request_id
      )
  ),
  non_commission_transactions as (
    select
      t.distributor_id,
      sum(t.amount) as amount
    from distributor_balance_transactions t
    left join exchange_requests er
      on er.id = t.source_id
      and t.source_type = 'DOMAIN_EXCHANGE'
    where t.source_type not in (
      'COMMISSION',
      'COMMISSION_TOP_DISTRIBUTOR',
      'COMMISSION_DISTRIBUTOR',
      'COMMISSION_SUB_DISTRIBUTOR',
      'COMMISSION_TOP_DISTRIBUTOR_REVERSAL',
      'COMMISSION_DISTRIBUTOR_REVERSAL',
      'COMMISSION_SUB_DISTRIBUTOR_REVERSAL',
      'COMMISSION_REVERSAL',
      'COMMISSION_BALANCE_RECALC'
    )
      and not (
        t.source_type = 'DOMAIN_EXCHANGE'
        and er.domain_id is not null
      )
    group by t.distributor_id
  ),
  desired as (
    select
      d.id,
      greatest(
        coalesce(sum(cp.amount), 0) + coalesce(max(nct.amount), 0),
        0
      ) as desired_balance
    from distributors d
    left join commission_parts cp on cp.distributor_id = d.id
    left join non_commission_transactions nct on nct.distributor_id = d.id
    where d.status = 'ACTIVE'
    group by d.id
  )
  select
    d.id::text,
    d.name,
    a.login_id,
    a.role::text as role,
    d.current_balance::text as current_balance,
    desired.desired_balance::text as desired_balance,
    (desired.desired_balance - d.current_balance)::text as diff
  from desired
  join distributors d on d.id = desired.id
  left join admins a on a.id = d.admin_id
  where desired.desired_balance <> d.current_balance
  order by abs(desired.desired_balance - d.current_balance) desc, d.name asc
`;

async function main() {
  await loadLocalEnv();

  const apply = process.argv.includes("--apply");
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    await client.query("begin");

    const rows = (await client.query(desiredBalanceSql)).rows;

    if (!apply) {
      await client.query("rollback");
      console.log(JSON.stringify({ mode: "dry-run", count: rows.length, rows }, null, 2));
      return;
    }

    const actorResult = await client.query(
      `
        select id::text
        from admins
        where role = 'MASTER'
          and status = 'ACTIVE'
        order by created_at asc
        limit 1
      `,
    );
    const actorId = actorResult.rows[0]?.id;

    if (!actorId) {
      throw new Error("보정 내역을 기록할 마스터 계정을 찾지 못했습니다.");
    }

    for (const row of rows) {
      await client.query(
        `
          update distributors
          set current_balance = $2,
              updated_at = now()
          where id = $1::uuid
        `,
        [row.id, row.desired_balance],
      );
      await client.query(
        `
          insert into distributor_balance_transactions (
            distributor_id,
            amount,
            balance_before,
            balance_after,
            source_type,
            source_id,
            memo,
            created_by
          )
          values ($1::uuid, $2, $3, $4, 'COMMISSION_BALANCE_RECALC', $5::uuid, '수수료 요율 기준 보유금 재계산', $6::uuid)
        `,
        [
          row.id,
          row.diff,
          row.current_balance,
          row.desired_balance,
          randomUUID(),
          actorId,
        ],
      );
    }

    await client.query("commit");
    console.log(JSON.stringify({ mode: "apply", count: rows.length, rows }, null, 2));
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
  process.exit(1);
});

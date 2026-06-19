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

const missingCommissionSql = `
  with source as (
    select
      cr.id as charge_request_id,
      cr.amount as charge_amount,
      cr.processed_at,
      cr.requested_at,
      co.company_fee,
      co.distributor_fee as legacy_top_fee,
      greatest(co.saved_commission - co.company_fee - co.distributor_fee, 0) as legacy_distributor_fee,
      coalesce(fee.distributor_id, co.distributor_id, cr.distributor_id) as primary_distributor_id,
      fee.sub_distributor_id,
      coalesce(fee.distributor_rate, 0) as top_rate,
      coalesce(fee.agency_rate, 0) as distributor_rate,
      coalesce(fee.sub_distributor_rate, 0) as sub_distributor_rate
    from commission_records co
    join charge_requests cr on cr.id = co.charge_request_id
    left join lateral (
      select
        fr.distributor_id,
        fr.sub_distributor_id,
        fr.distributor_rate,
        fr.agency_rate,
        coalesce(fr.sub_distributor_rate, 0) as sub_distributor_rate
      from fee_rates fr
      where fr.domain_id = cr.domain_id
        and fr.starts_at <= coalesce(cr.processed_at, cr.requested_at, cr.created_at)
        and (fr.ends_at is null or fr.ends_at > coalesce(cr.processed_at, cr.requested_at, cr.created_at))
      order by fr.starts_at desc, fr.created_at desc
      limit 1
    ) fee on true
    where co.status in ('APPROVED', 'COMPLETED')
      and cr.status in ('APPROVED', 'COMPLETED')
  ),
  resolved as (
    select
      source.*,
      primary_dist.id as distributor_id,
      coalesce(parent_dist.id, primary_dist.id) as top_distributor_id
    from source
    left join distributors primary_dist on primary_dist.id = source.primary_distributor_id
    left join distributors parent_dist on parent_dist.id = primary_dist.parent_distributor_id
  ),
  desired as (
    select
      charge_request_id,
      top_distributor_id as distributor_id,
      case
        when top_rate > 0 then floor(charge_amount * (top_rate / 100))
        else legacy_top_fee
      end as amount,
      'COMMISSION_TOP_DISTRIBUTOR' as source_type,
      '충전 승인 상위총판 수수료 적립' as memo
    from resolved
    where top_distributor_id is not null

    union all

    select
      charge_request_id,
      distributor_id,
      case
        when distributor_rate > 0 then floor(charge_amount * (distributor_rate / 100))
        else legacy_distributor_fee
      end as amount,
      'COMMISSION_DISTRIBUTOR' as source_type,
      '충전 승인 총판 수수료 적립' as memo
    from resolved
    where distributor_id is not null
      and top_distributor_id is not null
      and distributor_id <> top_distributor_id

    union all

    select
      charge_request_id,
      sub_distributor_id as distributor_id,
      floor(charge_amount * (sub_distributor_rate / 100)) as amount,
      'COMMISSION_SUB_DISTRIBUTOR' as source_type,
      '충전 승인 추가 총판 수수료 적립' as memo
    from resolved
    where sub_distributor_id is not null
      and sub_distributor_rate > 0
  )
  select
    desired.charge_request_id::text,
    desired.distributor_id::text,
    dist.name as distributor_name,
    desired.amount::text,
    desired.source_type,
    desired.memo
  from desired
  join distributors dist on dist.id = desired.distributor_id
  where desired.amount > 0
    and not exists (
      select 1
      from distributor_balance_transactions existing
      where existing.source_id = desired.charge_request_id
        and existing.source_type = desired.source_type
    )
  order by desired.charge_request_id, desired.source_type
`;

const desiredBalanceSql = `
  with commission_parts as (
    select
      t.distributor_id,
      t.amount
    from distributor_balance_transactions t
    join charge_requests cr on cr.id = t.source_id
    where t.source_type in (
      'COMMISSION_TOP_DISTRIBUTOR',
      'COMMISSION_DISTRIBUTOR',
      'COMMISSION_SUB_DISTRIBUTOR',
      'COMMISSION_PARTNER_1',
      'COMMISSION_PARTNER_2',
      'COMMISSION_PARTNER_3'
    )
      and t.amount > 0
      and cr.status in ('APPROVED', 'COMPLETED')
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
      'COMMISSION_PARTNER_1',
      'COMMISSION_PARTNER_2',
      'COMMISSION_PARTNER_3',
      'COMMISSION_TOP_DISTRIBUTOR_REVERSAL',
      'COMMISSION_DISTRIBUTOR_REVERSAL',
      'COMMISSION_SUB_DISTRIBUTOR_REVERSAL',
      'COMMISSION_PARTNER_1_REVERSAL',
      'COMMISSION_PARTNER_2_REVERSAL',
      'COMMISSION_PARTNER_3_REVERSAL',
      'COMMISSION_REVERSAL',
      'COMMISSION_BALANCE_RECALC'
    )
      and not (
        t.source_type = 'DOMAIN_EXCHANGE'
        and er.domain_id is not null
      )
    group by t.distributor_id
  ),
  reversals as (
    select
      t.distributor_id,
      sum(t.amount) as amount
    from distributor_balance_transactions t
    where t.source_type in (
      'COMMISSION_TOP_DISTRIBUTOR_REVERSAL',
      'COMMISSION_DISTRIBUTOR_REVERSAL',
      'COMMISSION_SUB_DISTRIBUTOR_REVERSAL',
      'COMMISSION_PARTNER_1_REVERSAL',
      'COMMISSION_PARTNER_2_REVERSAL',
      'COMMISSION_PARTNER_3_REVERSAL',
      'COMMISSION_REVERSAL'
    )
    group by t.distributor_id
  ),
  desired as (
    select
      d.id,
      greatest(
        coalesce(sum(cp.amount), 0)
          + coalesce(max(nct.amount), 0)
          + coalesce(max(reversals.amount), 0),
        0
      ) as desired_balance
    from distributors d
    left join commission_parts cp on cp.distributor_id = d.id
    left join non_commission_transactions nct on nct.distributor_id = d.id
    left join reversals on reversals.distributor_id = d.id
    where d.status = 'ACTIVE'
    group by d.id
  )
  select
    d.id::text,
    d.name,
    d.current_balance::text as current_balance,
    desired.desired_balance::text as desired_balance
  from desired
  join distributors d on d.id = desired.id
  where desired.desired_balance <> d.current_balance
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

    const missingRows = (await client.query(missingCommissionSql)).rows;

    if (!apply) {
      await client.query("rollback");
      console.log(JSON.stringify({ mode: "dry-run", count: missingRows.length, rows: missingRows }, null, 2));
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
      throw new Error("복구 내역을 기록할 마스터 계정을 찾지 못했습니다.");
    }

    for (const row of missingRows) {
      const balanceResult = await client.query(
        `
          select current_balance::text
          from distributors
          where id = $1::uuid
          for update
        `,
        [row.distributor_id],
      );
      const currentBalance = Number(balanceResult.rows[0]?.current_balance ?? 0);

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
          values ($1::uuid, $2, $3, $4, $5, $6::uuid, $7, $8::uuid)
          on conflict (source_type, source_id) do nothing
        `,
        [
          row.distributor_id,
          row.amount,
          currentBalance,
          currentBalance + Number(row.amount),
          row.source_type,
          row.charge_request_id,
          row.memo,
          actorId,
        ],
      );
    }

    const balanceRows = (await client.query(desiredBalanceSql)).rows;

    for (const row of balanceRows) {
      await client.query(
        `
          update distributors
          set current_balance = $2,
              updated_at = now()
          where id = $1::uuid
        `,
        [row.id, row.desired_balance],
      );
    }

    await client.query("commit");
    console.log(
      JSON.stringify(
        {
          mode: "apply",
          insertedCount: missingRows.length,
          adjustedBalanceCount: balanceRows.length,
          insertedRows: missingRows,
          adjustedBalances: balanceRows,
        },
        null,
        2,
      ),
    );
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

import { getDashboardSummary } from "@/lib/mock-report-service";
import { getAdminSettingsFromCookie } from "@/lib/settings-cookie";
import { getMockChargeStateFromCookie } from "@/lib/mock-state-cookie";
import { hasDatabaseUrl, query } from "@/lib/db";
import { getScopedDistributorCondition } from "@/lib/master-scope";
import type { SessionUser } from "@/lib/auth";

type DashboardSummaryRow = {
  domain_name: string | null;
  pending_count: string;
  approved_count: string;
  rejected_count: string;
  pending_charge_total: string;
  approved_charge_total: string;
  fee_total: string;
};

type FeeRateRow = {
  company_rate: string;
  distributor_rate: string;
  agency_rate: string;
};

type DashboardPartnerSummaryRow = {
  entity_id: string;
  entity_name: string;
  entity_type: "DOMAIN" | "DISTRIBUTOR" | "TOP_DISTRIBUTOR";
  charge_total: string;
  fee_total: string;
  exchange_total: string;
  balance_total: string;
};

export type DashboardPartnerSummary = {
  id: string;
  name: string;
  type: "DOMAIN" | "DISTRIBUTOR" | "TOP_DISTRIBUTOR";
  chargeTotal: number;
  feeTotal: number;
  exchangeTotal: number;
  balanceTotal: number;
};

export async function getDashboardSummaryForUser(user: SessionUser) {
  if (!hasDatabaseUrl()) {
    const state = await getMockChargeStateFromCookie();
    const settings = await getAdminSettingsFromCookie();

    return getDashboardSummary(user.companyName, state, settings);
  }
  const scope = getScopedDistributorCondition(user);
  const balanceScopeSql = getScopedDistributorCondition(
    user,
    "balance_dist",
    "balance_dist_admin",
  ).sql;

  const [summaryResult, feeRateResult] = await Promise.all([
    query<DashboardSummaryRow>(
      `
        select
          coalesce(min(d.domain_name), '전체') as domain_name,
          count(*) filter (where cr.status = 'PENDING')::text as pending_count,
          count(*) filter (where cr.status in ('APPROVED', 'COMPLETED'))::text as approved_count,
          count(*) filter (where cr.status in ('REJECTED', 'CANCELED'))::text as rejected_count,
          coalesce(sum(cr.amount) filter (where cr.status = 'PENDING'), 0)::text as pending_charge_total,
          coalesce(sum(cr.amount) filter (where cr.status in ('APPROVED', 'COMPLETED')), 0)::text as approved_charge_total,
          coalesce((
            select sum(balance_dist.current_balance)
            from distributors balance_dist
            left join admins balance_dist_admin on balance_dist_admin.id = balance_dist.admin_id
            where balance_dist.status = 'ACTIVE'
              ${balanceScopeSql}
          ), 0)::text as fee_total
        from charge_requests cr
        left join domains d on d.id = cr.domain_id
        left join distributors dist on dist.id = cr.distributor_id
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where 1 = 1
          ${scope.sql}
      `,
      scope.values,
    ),
    query<FeeRateRow>(
      `
        select fee.company_rate::text, fee.distributor_rate::text, fee.agency_rate::text
        from fee_rates fee
        left join distributors dist on dist.id = fee.distributor_id
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where fee.starts_at <= now()
          and (fee.ends_at is null or fee.ends_at > now())
          and (
            fee.distributor_id is null
            or (${scope.sql.replace("and ", "")})
          )
        order by fee.starts_at desc, fee.created_at desc
        limit 1
      `,
      scope.values,
    ),
  ]);
  const row = summaryResult.rows[0];
  const feeRate = feeRateResult.rows[0]
    ? Number(feeRateResult.rows[0].company_rate) +
      Number(feeRateResult.rows[0].distributor_rate) +
      Number(feeRateResult.rows[0].agency_rate)
    : 0.4;

  return {
    domainName: row?.domain_name ?? "전체",
    feeRate: Number(feeRate.toFixed(2)),
    pendingCount: Number(row?.pending_count ?? 0),
    approvedCount: Number(row?.approved_count ?? 0),
    rejectedCount: Number(row?.rejected_count ?? 0),
    pendingChargeTotal: Number(row?.pending_charge_total ?? 0),
    approvedChargeTotal: Number(row?.approved_charge_total ?? 0),
    feeTotal: Number(row?.fee_total ?? 0),
  };
}

export async function getDashboardPartnerSummariesForUser(user: SessionUser) {
  if (!hasDatabaseUrl()) {
    return [] satisfies DashboardPartnerSummary[];
  }

  const scope = getScopedDistributorCondition(user);
  const result = await query<DashboardPartnerSummaryRow>(
    `
      with scoped_distributors as (
        select
          dist.id,
          dist.name,
          dist.current_balance,
          dist.admin_id
        from distributors dist
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where dist.status = 'ACTIVE'
          ${scope.sql}
      ),
      scoped_entities as (
        select
          concat('domain:', dom.id::text) as entity_id,
          dom.domain_name as entity_name,
          'DOMAIN'::text as entity_type,
          dist.id as distributor_id,
          dist.current_balance
        from domains dom
        join scoped_distributors dist on dist.id = dom.distributor_id
        where dom.status <> 'DELETED'

        union all

        select
          concat('distributor:', dist.id::text) as entity_id,
          dist.name as entity_name,
          case
            when dist_admin.role = 'TOP_DISTRIBUTOR' then 'TOP_DISTRIBUTOR'::text
            else 'DISTRIBUTOR'::text
          end as entity_type,
          dist.id as distributor_id,
          dist.current_balance
        from scoped_distributors dist
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where not exists (
          select 1
          from domains dom
          where dom.distributor_id = dist.id
            and dom.status <> 'DELETED'
        )
      ),
      charge_totals as (
        select
          entity.entity_id,
          coalesce(sum(cr.amount), 0)::text as charge_total
        from scoped_entities entity
        left join charge_requests cr on (
          (entity.entity_type = 'DOMAIN' and cr.domain_id::text = replace(entity.entity_id, 'domain:', ''))
          or (entity.entity_type in ('DISTRIBUTOR', 'TOP_DISTRIBUTOR') and cr.distributor_id = entity.distributor_id and cr.domain_id is null)
        )
          and cr.status in ('APPROVED', 'COMPLETED')
        group by entity.entity_id
      ),
      fee_totals as (
        select
          entity.entity_id,
          coalesce(sum(co.saved_commission), 0)::text as fee_total
        from scoped_entities entity
        left join commission_records co on (
          (entity.entity_type = 'DOMAIN' and co.domain_id::text = replace(entity.entity_id, 'domain:', ''))
          or (entity.entity_type in ('DISTRIBUTOR', 'TOP_DISTRIBUTOR') and co.distributor_id = entity.distributor_id and co.domain_id is null)
        )
          and co.status in ('APPROVED', 'COMPLETED')
        group by entity.entity_id
      ),
      exchange_totals as (
        select
          entity.entity_id,
          coalesce(sum(er.amount), 0)::text as exchange_total
        from scoped_entities entity
        left join exchange_requests er on (
          (entity.entity_type = 'DOMAIN' and er.domain_id::text = replace(entity.entity_id, 'domain:', ''))
          or (entity.entity_type in ('DISTRIBUTOR', 'TOP_DISTRIBUTOR') and er.distributor_id = entity.distributor_id and er.domain_id is null)
        )
          and er.status in ('APPROVED', 'COMPLETED')
        group by entity.entity_id
      )
      select
        entity.entity_id,
        entity.entity_name,
        entity.entity_type,
        charge_totals.charge_total,
        fee_totals.fee_total,
        exchange_totals.exchange_total,
        entity.current_balance::text as balance_total
      from scoped_entities entity
      join charge_totals on charge_totals.entity_id = entity.entity_id
      join fee_totals on fee_totals.entity_id = entity.entity_id
      join exchange_totals on exchange_totals.entity_id = entity.entity_id
      order by entity.entity_name asc
    `,
    scope.values,
  );

  return result.rows.map((row) => ({
    id: row.entity_id,
    name: row.entity_name,
    type: row.entity_type,
    chargeTotal: Number(row.charge_total),
    feeTotal: Number(row.fee_total),
    exchangeTotal: Number(row.exchange_total),
    balanceTotal: Number(row.balance_total),
  }));
}

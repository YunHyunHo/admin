import { getDashboardSummary } from "@/lib/mock-report-service";
import { getAdminSettingsFromCookie } from "@/lib/settings-cookie";
import { getMockChargeStateFromCookie } from "@/lib/mock-state-cookie";
import { hasDatabaseUrl, query } from "@/lib/db";
import { ensureFeeRateSchema } from "@/lib/fee-rate-schema";
import { getCurrentKoreanDayRange } from "@/lib/korean-time";
import {
  getManagedCompanyIds,
  getScopedDataCondition,
  getScopedDistributorCondition,
} from "@/lib/master-scope";
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
  sub_distributor_rate: string;
};

type DashboardPartnerSummaryRow = {
  entity_id: string;
  entity_name: string;
  entity_login_id: string | null;
  entity_type: "DISTRIBUTOR" | "TOP_DISTRIBUTOR" | "COMPANY";
  has_active_domain: boolean;
  charge_total: string;
  fee_total: string;
  exchange_total: string;
  balance_total: string;
};

export type DashboardPartnerSummary = {
  id: string;
  name: string;
  loginId: string;
  type: "DISTRIBUTOR" | "TOP_DISTRIBUTOR" | "COMPANY";
  hasActiveDomain: boolean;
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
  const scope = await getScopedDataCondition(user, {
    company: "cr",
    distributor: "dist",
    distributorAdmin: "dist_admin",
  });
  const balanceScope =
    user.role === "DOMAIN_ADMIN"
      ? {
          sql: "and balance_dom.company_id = any($1::uuid[])",
          values: [await getManagedCompanyIds(user.id)] as unknown[],
        }
      : user.role === "MASTER"
        ? { sql: "", values: [] as unknown[] }
        : getScopedDistributorCondition(
            user,
            "balance_dist",
            "balance_dist_admin",
          );
  const feeRateScopeSql =
    user.role === "DOMAIN_ADMIN"
      ? scope.sql.replaceAll("cr.", "fee.")
      : scope.sql
        ? `and (
            fee.distributor_id is null
            or (${scope.sql.replace("and ", "")})
          )`
        : "";
  const balanceTotalSql =
    user.role === "DOMAIN_ADMIN"
      ? `
          select sum(balance_dom.current_balance)
          from domains balance_dom
          where balance_dom.status <> 'DELETED'
            ${balanceScope.sql}
        `
      : `
          select sum(balance_dist.current_balance)
          from distributors balance_dist
          left join admins balance_dist_admin on balance_dist_admin.id = balance_dist.admin_id
          where balance_dist.status = 'ACTIVE'
            ${balanceScope.sql}
        `;

  await ensureFeeRateSchema();

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
          coalesce((${balanceTotalSql}), 0)::text as fee_total
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
        select
          fee.company_rate::text,
          fee.distributor_rate::text,
          fee.agency_rate::text,
          coalesce(fee.sub_distributor_rate, 0)::text as sub_distributor_rate
        from fee_rates fee
        left join distributors dist on dist.id = fee.distributor_id
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where fee.starts_at <= now()
          and (fee.ends_at is null or fee.ends_at > now())
          ${feeRateScopeSql}
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
      Number(feeRateResult.rows[0].agency_rate) +
      Number(feeRateResult.rows[0].sub_distributor_rate)
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

  if (user.role === "DOMAIN_ADMIN") {
    return getDashboardCompanySummariesForDomainAdmin(user);
  }

  const dashboardScope =
    user.role === "MASTER"
      ? {
          sql: "",
          values: [] as string[],
        }
      : user.role === "TOP_DISTRIBUTOR"
        ? {
            sql: `
              and (
                dist.admin_id = $3::uuid
                or dist.parent_distributor_id in (
                  select parent_dist.id
                  from distributors parent_dist
                  where parent_dist.admin_id = $3::uuid
                    and parent_dist.status = 'ACTIVE'
                )
              )
            `,
            values: [user.id],
          }
        : getScopedDistributorCondition(user);
  const scopeSql = dashboardScope.sql.replaceAll("$1", "$3");
  const { startDate, endDateExclusive } = getCurrentKoreanDayRange();
  const result = await query<DashboardPartnerSummaryRow>(
    `
      with scoped_distributors as (
        select
          dist.id,
          dist.name,
          dist.current_balance,
          dist.admin_id,
          dist_admin.login_id
        from distributors dist
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where dist.status = 'ACTIVE'
          ${scopeSql}
      ),
      scoped_entities as (
        select
          concat('distributor:', dist.id::text) as entity_id,
          dist.name as entity_name,
          dist.login_id as entity_login_id,
          case
            when dist_admin.role = 'TOP_DISTRIBUTOR' then 'TOP_DISTRIBUTOR'::text
            else 'DISTRIBUTOR'::text
          end as entity_type,
          exists (
            select 1
            from domains dom
            where dom.distributor_id = dist.id
              and dom.status <> 'DELETED'
          ) as has_active_domain,
          dist.id as distributor_id,
          dist.current_balance
        from scoped_distributors dist
        left join admins dist_admin on dist_admin.id = dist.admin_id
      ),
      charge_totals as (
        select
          entity.entity_id,
          coalesce(sum(cr.amount), 0)::text as charge_total
        from scoped_entities entity
        left join charge_requests cr on (
          cr.distributor_id = entity.distributor_id
          or exists (
            select 1
            from domains dom
            where dom.id = cr.domain_id
              and dom.distributor_id = entity.distributor_id
              and dom.status <> 'DELETED'
          )
        )
          and cr.status in ('APPROVED', 'COMPLETED')
          and cr.processed_at is not null
          and (cr.processed_at at time zone 'Asia/Seoul') >= $1::date
          and (cr.processed_at at time zone 'Asia/Seoul') < $2::date
        group by entity.entity_id
      ),
      fee_totals as (
        select
          entity.entity_id,
          coalesce(sum(t.amount), 0)::text as fee_total
        from scoped_entities entity
        left join distributor_balance_transactions t on t.distributor_id = entity.distributor_id
          and t.source_type in (
            'COMMISSION',
            'COMMISSION_TOP_DISTRIBUTOR',
            'COMMISSION_DISTRIBUTOR',
            'COMMISSION_SUB_DISTRIBUTOR',
            'COMMISSION_REVERSAL',
            'COMMISSION_TOP_DISTRIBUTOR_REVERSAL',
            'COMMISSION_DISTRIBUTOR_REVERSAL',
            'COMMISSION_SUB_DISTRIBUTOR_REVERSAL'
          )
          and (t.created_at at time zone 'Asia/Seoul') >= $1::date
          and (t.created_at at time zone 'Asia/Seoul') < $2::date
        group by entity.entity_id
      ),
      exchange_totals as (
        select
          entity.entity_id,
          coalesce(sum(summary.amount), 0)::text as exchange_total
        from scoped_entities entity
        left join (
          select
            concat('distributor:', dom.distributor_id::text) as entity_id,
            er.amount
          from exchange_requests er
          join domains dom on dom.id = er.domain_id
          where er.domain_id is not null
            and dom.status <> 'DELETED'
            and er.status in ('APPROVED', 'COMPLETED')
            and er.processed_at is not null
            and (er.processed_at at time zone 'Asia/Seoul') >= $1::date
            and (er.processed_at at time zone 'Asia/Seoul') < $2::date

          union all

          select
            concat('distributor-summary:', dw.distributor_id::text) as entity_id,
            dw.request_amount as amount
          from distributor_withdrawals dw
          where dw.status in ('APPROVED', 'COMPLETED')
            and dw.processed_at is not null
            and (dw.processed_at at time zone 'Asia/Seoul') >= $1::date
            and (dw.processed_at at time zone 'Asia/Seoul') < $2::date
        ) summary on (
          summary.entity_id = entity.entity_id
          or summary.entity_id = concat('distributor-summary:', entity.distributor_id::text)
        )
        group by entity.entity_id
      )
      select
        entity.entity_id,
        entity.entity_name,
        entity.entity_login_id,
        entity.entity_type,
        entity.has_active_domain,
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
    [startDate, endDateExclusive, ...dashboardScope.values],
  );

  return result.rows.map((row) => ({
    id: row.entity_id,
    name: row.entity_name,
    loginId: row.entity_login_id ?? "-",
    type: row.entity_type,
    hasActiveDomain: row.has_active_domain,
    chargeTotal: Number(row.charge_total),
    feeTotal: Number(row.fee_total),
    exchangeTotal: Number(row.exchange_total),
    balanceTotal: Number(row.balance_total),
  }));
}

async function getDashboardCompanySummariesForDomainAdmin(user: SessionUser) {
  const companyIds = await getManagedCompanyIds(user.id);

  if (!companyIds.length) {
    return [] satisfies DashboardPartnerSummary[];
  }

  const { startDate, endDateExclusive } = getCurrentKoreanDayRange();
  const result = await query<DashboardPartnerSummaryRow>(
    `
      select
        concat('company:', c.id::text) as entity_id,
        c.company_name as entity_name,
        $4::text as entity_login_id,
        'COMPANY'::text as entity_type,
        exists (
          select 1
          from domains dom
          where dom.company_id = c.id
            and dom.status <> 'DELETED'
        ) as has_active_domain,
        coalesce((
          select sum(cr.amount)
          from charge_requests cr
          where cr.company_id = c.id
            and cr.status in ('APPROVED', 'COMPLETED')
            and cr.processed_at is not null
            and (cr.processed_at at time zone 'Asia/Seoul') >= $2::date
            and (cr.processed_at at time zone 'Asia/Seoul') < $3::date
        ), 0)::text as charge_total,
        coalesce((
          select sum(co.saved_commission)
          from commission_records co
          where co.company_id = c.id
            and co.status in ('APPROVED', 'COMPLETED')
            and (co.created_at at time zone 'Asia/Seoul') >= $2::date
            and (co.created_at at time zone 'Asia/Seoul') < $3::date
        ), 0)::text as fee_total,
        coalesce((
          select sum(er.amount)
          from exchange_requests er
          where er.company_id = c.id
            and er.status in ('APPROVED', 'COMPLETED')
            and er.processed_at is not null
            and (er.processed_at at time zone 'Asia/Seoul') >= $2::date
            and (er.processed_at at time zone 'Asia/Seoul') < $3::date
        ), 0)::text as exchange_total,
        coalesce((
          select sum(dom.current_balance)
          from domains dom
          where dom.company_id = c.id
            and dom.status <> 'DELETED'
        ), 0)::text as balance_total
      from companies c
      where c.id = any($1::uuid[])
        and c.status = 'ACTIVE'
      order by c.company_name asc
    `,
    [companyIds, startDate, endDateExclusive, user.loginId],
  );

  return result.rows.map((row) => ({
    id: row.entity_id,
    name: row.entity_name,
    loginId: row.entity_login_id ?? "-",
    type: row.entity_type,
    hasActiveDomain: row.has_active_domain,
    chargeTotal: Number(row.charge_total),
    feeTotal: Number(row.fee_total),
    exchangeTotal: Number(row.exchange_total),
    balanceTotal: Number(row.balance_total),
  }));
}

export function sortDashboardPartnerSummaries(
  items: DashboardPartnerSummary[],
): DashboardPartnerSummary[] {
  return [...items].sort((left, right) => {
    const leftHasActivity = Number(
      left.balanceTotal > 0 ||
        left.chargeTotal > 0 ||
        left.exchangeTotal > 0 ||
        left.feeTotal > 0,
    );
    const rightHasActivity = Number(
      right.balanceTotal > 0 ||
        right.chargeTotal > 0 ||
        right.exchangeTotal > 0 ||
        right.feeTotal > 0,
    );

    return (
      rightHasActivity - leftHasActivity ||
      right.balanceTotal - left.balanceTotal ||
      right.chargeTotal - left.chargeTotal ||
      right.exchangeTotal - left.exchangeTotal ||
      right.feeTotal - left.feeTotal ||
      (left.type === right.type ? 0 : left.type === "DISTRIBUTOR" ? -1 : 1) ||
      left.name.localeCompare(right.name, "ko")
    );
  });
}

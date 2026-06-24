import { getDashboardSummary } from "@/lib/mock-report-service";
import { getAdminSettingsFromCookie } from "@/lib/settings-cookie";
import { getMockChargeStateFromCookie } from "@/lib/mock-state-cookie";
import { hasDatabaseUrl, query } from "@/lib/db";
import { ensureFeeRateSchema } from "@/lib/fee-rate-schema";
import { ensureDashboardOrderSchema } from "@/lib/dashboard-order-schema";
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
  dashboard_position: number | null;
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
  position: number | null;
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
        ? getScopedDistributorCondition(
            user,
            "balance_dist",
            "balance_dist_admin",
          )
        : getScopedDistributorCondition(
            user,
            "balance_dist",
            "balance_dist_admin",
          );
  const feeRateScope =
    user.role === "DOMAIN_ADMIN"
      ? {
          sql: scope.sql.replaceAll("cr.", "fee."),
          values: scope.values,
        }
      : await getScopedDataCondition(user, {
          company: "fee",
          distributor: "dist",
          distributorAdmin: "dist_admin",
        });
  const feeRateScopeSql = feeRateScope.sql;
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
      feeRateScope.values,
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

  await ensureDashboardOrderSchema();

  const dashboardScope = await getScopedDataCondition(user, {
    company: "dom",
    distributor: "dist",
    distributorAdmin: "dist_admin",
  });
  const scopeSql = dashboardScope.sql.replaceAll("$1", "$3");
  const { startDate, endDateExclusive } = getCurrentKoreanDayRange();
  const result = await query<DashboardPartnerSummaryRow>(
    `
      with scoped_domains as (
        select
          dom.id,
          c.company_name,
          dom.current_balance,
          dom.dashboard_position,
          domain_admin.login_id
        from domains dom
        join companies c on c.id = dom.company_id
        left join distributors dist on dist.id = dom.distributor_id
        left join admins dist_admin on dist_admin.id = dist.admin_id
        left join lateral (
          select a.login_id
          from admin_domain_mappings adm
          join admins a on a.id = adm.admin_id
          where adm.domain_id = dom.id
            and a.role = 'DOMAIN_ADMIN'
            and a.status <> 'DELETED'
          order by a.created_at desc
          limit 1
        ) domain_admin on true
        where dom.status <> 'DELETED'
          and c.status = 'ACTIVE'
          ${scopeSql}
      ),
      scoped_entities as (
        select
          concat('domain:', dom.id::text) as entity_id,
          dom.company_name as entity_name,
          dom.login_id as entity_login_id,
          'COMPANY'::text as entity_type,
          true as has_active_domain,
          dom.id as domain_id,
          dom.current_balance,
          dom.dashboard_position
        from scoped_domains dom
      ),
      charge_totals as (
        select
          entity.entity_id,
          coalesce(sum(cr.amount), 0)::text as charge_total
        from scoped_entities entity
        left join charge_requests cr on cr.domain_id = entity.domain_id
          and cr.status in ('APPROVED', 'COMPLETED')
          and cr.processed_at is not null
          and (cr.processed_at at time zone 'Asia/Seoul') >= $1::date
          and (cr.processed_at at time zone 'Asia/Seoul') < $2::date
        group by entity.entity_id
      ),
      fee_totals as (
        select
          entity.entity_id,
          coalesce(sum(co.saved_commission), 0)::text as fee_total
        from scoped_entities entity
        left join commission_records co on co.domain_id = entity.domain_id
          and co.status in ('APPROVED', 'COMPLETED')
          and (co.created_at at time zone 'Asia/Seoul') >= $1::date
          and (co.created_at at time zone 'Asia/Seoul') < $2::date
        group by entity.entity_id
      ),
      exchange_totals as (
        select
          entity.entity_id,
          coalesce(sum(er.amount), 0)::text as exchange_total
        from scoped_entities entity
        left join exchange_requests er on er.domain_id = entity.domain_id
          and er.status in ('APPROVED', 'COMPLETED')
          and er.processed_at is not null
          and (er.processed_at at time zone 'Asia/Seoul') >= $1::date
          and (er.processed_at at time zone 'Asia/Seoul') < $2::date
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
        entity.current_balance::text as balance_total,
        entity.dashboard_position
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
    position: row.dashboard_position,
  }));
}

export async function saveDashboardPartnerSummaryOrder(
  user: SessionUser,
  orderedEntityIds: string[],
) {
  if (user.role !== "MASTER") {
    throw new Error("마스터 계정만 업체 순번을 변경할 수 있습니다.");
  }

  const currentItems = await getDashboardPartnerSummariesForUser(user);
  const currentIds = currentItems.map((item) => item.id);
  const requestedIds = [...new Set(orderedEntityIds)];

  if (
    requestedIds.length !== currentIds.length ||
    requestedIds.some((id) => !currentIds.includes(id))
  ) {
    throw new Error("현재 표시된 업체 전체 순서를 다시 확인해주세요.");
  }

  const domainIds = requestedIds.map((id) => id.replace(/^domain:/, ""));

  await query(
    `
      update domains dom
      set dashboard_position = requested.position::integer,
          updated_at = now()
      from unnest($1::uuid[]) with ordinality as requested(id, position)
      where dom.id = requested.id
    `,
    [domainIds],
  );
}

export function sortDashboardPartnerSummaries(
  items: DashboardPartnerSummary[],
): DashboardPartnerSummary[] {
  return [...items].sort(
    (left, right) =>
      (left.position ?? Number.MAX_SAFE_INTEGER) -
        (right.position ?? Number.MAX_SAFE_INTEGER) ||
      left.name.localeCompare(right.name, "ko"),
  );
}

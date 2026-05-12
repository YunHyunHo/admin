import { getDashboardSummary } from "@/lib/mock-report-service";
import { getAdminSettingsFromCookie } from "@/lib/settings-cookie";
import { getMockChargeStateFromCookie } from "@/lib/mock-state-cookie";
import { hasDatabaseUrl, query } from "@/lib/db";
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

export async function getDashboardSummaryForUser(user: SessionUser) {
  if (!hasDatabaseUrl()) {
    const state = await getMockChargeStateFromCookie();
    const settings = await getAdminSettingsFromCookie();

    return getDashboardSummary(user.companyName, state, settings);
  }

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
            select sum(saved_commission)
            from commission_records
            where status in ('APPROVED', 'COMPLETED')
          ), 0)::text as fee_total
        from charge_requests cr
        left join domains d on d.id = cr.domain_id
      `,
    ),
    query<FeeRateRow>(
      `
        select company_rate::text, distributor_rate::text, agency_rate::text
        from fee_rates
        where starts_at <= now() and (ends_at is null or ends_at > now())
        order by starts_at desc, created_at desc
        limit 1
      `,
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

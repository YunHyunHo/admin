import { getFeeRecords } from "@/lib/mock-report-service";
import { hasDatabaseUrl, query } from "@/lib/db";
import { formatKoreanDateTime } from "@/lib/korean-time";
import { getScopedDataCondition, type ScopedClause } from "@/lib/master-scope";
import { getAdminSettingsFromCookie } from "@/lib/settings-cookie";
import { getMockChargeStateFromCookie } from "@/lib/mock-state-cookie";
import type { SessionUser } from "@/lib/auth";

const DEFAULT_ROW_LIMIT = 200;

export type FeeRecordRow = {
  id: string;
  topAgent: string;
  subAgent: string;
  acquisitionBranch: string;
  domain: string;
  uid: string;
  amount: number;
  feeRate: number;
  fee: number;
  bankName: string;
  acquiredAt: string;
  requestedAt: string;
};

type FeeRecordDbRow = {
  id: string;
  top_agent: string | null;
  sub_agent: string | null;
  child_distributor_names: string | null;
  acquisition_branch: string;
  domain: string;
  uid: string;
  amount: string;
  fee_rate: string;
  fee: string;
  bank_name: string | null;
  acquired_at: Date | string;
  requested_at: Date | string;
};

async function getFeeRecordScope(user: SessionUser): Promise<ScopedClause> {
  return getScopedDataCondition(user, {
    company: "co",
    distributor: "dist",
    distributorAdmin: "dist_admin",
  });
}

function formatStamp(value: Date | string) {
  return formatKoreanDateTime(value);
}

function toFeeRecord(row: FeeRecordDbRow): FeeRecordRow {
  const subAgent = row.sub_agent ?? row.child_distributor_names ?? "-";

  return {
    id: row.id,
    topAgent: row.top_agent ?? "마스터 관리자",
    subAgent,
    acquisitionBranch: subAgent,
    domain: row.domain,
    uid: row.uid,
    amount: Number(row.amount),
    feeRate: Number(row.fee_rate),
    fee: Number(row.fee),
    bankName: row.bank_name ?? "-",
    acquiredAt: formatStamp(row.acquired_at),
    requestedAt: formatStamp(row.requested_at),
  };
}

export async function getFeeRecordsForUser(
  user: SessionUser,
  startDate: string,
  endDate: string,
) {
  if (!hasDatabaseUrl()) {
    const state = await getMockChargeStateFromCookie();
    const settings = await getAdminSettingsFromCookie();

    return getFeeRecords(user.companyName, startDate, endDate, state, settings);
  }
  const scope = await getFeeRecordScope(user);
  const scopeSql = scope.sql.replaceAll("$1", "$3");
  const values = user.role === "MASTER"
    ? [startDate, endDate]
    : [startDate, endDate, user.id];

  const result = await query<FeeRecordDbRow>(
    `
      select
        cr.id::text,
        coalesce(parent_dist.name, dist.name) as top_agent,
        case when parent_dist.id is null then null else dist.name end as sub_agent,
        child_dist.names as child_distributor_names,
        coalesce(case when parent_dist.id is null then child_dist.names else dist.name end, c.company_name) as acquisition_branch,
        coalesce(nullif(d.domain_name, ''), c.company_name, '-') as domain,
        cr.user_uid as uid,
        co.charge_amount::text as amount,
        co.commission_rate::text as fee_rate,
        co.saved_commission::text as fee,
        cr.bank_name,
        co.created_at as acquired_at,
        cr.requested_at
      from commission_records co
      join charge_requests cr on cr.id = co.charge_request_id
      join companies c on c.id = co.company_id
      left join domains d on d.id = co.domain_id
      left join distributors dist on dist.id = co.distributor_id
      left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
      left join lateral (
        select string_agg(child.name, ', ' order by child.name) as names
        from distributors child
        where child.parent_distributor_id = dist.id
          and child.status = 'ACTIVE'
      ) child_dist on parent_dist.id is null
      where
        co.status in ('APPROVED', 'COMPLETED')
        and co.created_at >= $1::date
        and co.created_at < ($2::date + interval '1 day')
        ${scopeSql}
      order by co.created_at desc
      limit ${DEFAULT_ROW_LIMIT}
    `,
    values,
  );
  const rows = result.rows.map(toFeeRecord);

  return {
    rows,
    totals: rows.reduce(
      (sum, row) => ({
        amount: sum.amount + row.amount,
        fee: sum.fee + row.fee,
      }),
      { amount: 0, fee: 0 },
    ),
  };
}

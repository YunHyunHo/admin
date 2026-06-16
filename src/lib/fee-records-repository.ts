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
    company: "cr",
    distributor: "recipient_dist",
    distributorAdmin: "recipient_admin",
  });
}

function formatStamp(value: Date | string) {
  return formatKoreanDateTime(value);
}

function toFeeRecord(row: FeeRecordDbRow): FeeRecordRow {
  const subAgent = row.sub_agent ?? "-";

  return {
    id: row.id,
    topAgent: row.top_agent ?? "마스터 관리자",
    subAgent,
    acquisitionBranch: row.acquisition_branch,
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
  const values = [startDate, endDate, ...scope.values];

  const result = await query<FeeRecordDbRow>(
    `
      select
        concat(t.source_id::text, ':', t.source_type, ':', t.distributor_id::text) as id,
        case
          when t.source_type = 'COMMISSION_TOP_DISTRIBUTOR' then recipient_dist.name
          when recipient_parent.id is not null then recipient_parent.name
          else coalesce(source_parent.name, source_dist.name, recipient_dist.name)
        end as top_agent,
        case
          when t.source_type = 'COMMISSION_TOP_DISTRIBUTOR' then
            case
              when source_dist.id is not null and source_dist.id <> recipient_dist.id then source_dist.name
              else null
            end
          else recipient_dist.name
        end as sub_agent,
        recipient_dist.name as acquisition_branch,
        coalesce(nullif(d.domain_name, ''), c.company_name, '-') as domain,
        cr.user_uid as uid,
        cr.amount::text as amount,
        case
          when cr.amount > 0 then round((t.amount / cr.amount) * 100, 4)
          else 0
        end::text as fee_rate,
        t.amount::text as fee,
        cr.bank_name,
        t.created_at as acquired_at,
        cr.requested_at
      from distributor_balance_transactions t
      join charge_requests cr on cr.id = t.source_id
      join companies c on c.id = cr.company_id
      left join domains d on d.id = cr.domain_id
      left join distributors source_dist on source_dist.id = cr.distributor_id
      left join distributors source_parent on source_parent.id = source_dist.parent_distributor_id
      join distributors recipient_dist on recipient_dist.id = t.distributor_id
      left join distributors recipient_parent on recipient_parent.id = recipient_dist.parent_distributor_id
      left join admins recipient_admin on recipient_admin.id = recipient_dist.admin_id
      where
        cr.status in ('APPROVED', 'COMPLETED')
        and t.source_type in (
          'COMMISSION_TOP_DISTRIBUTOR',
          'COMMISSION_DISTRIBUTOR',
          'COMMISSION_SUB_DISTRIBUTOR'
        )
        and t.amount > 0
        and t.created_at >= $1::date
        and t.created_at < ($2::date + interval '1 day')
        ${scopeSql}
      order by t.created_at desc
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

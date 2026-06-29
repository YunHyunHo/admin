import { getFeeRecords } from "@/lib/mock-report-service";
import { hasDatabaseUrl, query } from "@/lib/db";
import { KOREA_TIME_ZONE, formatKoreanDateTime } from "@/lib/korean-time";
import { getScopedDataCondition, type ScopedClause } from "@/lib/master-scope";
import { getAdminSettingsFromCookie } from "@/lib/settings-cookie";
import { getMockChargeStateFromCookie } from "@/lib/mock-state-cookie";
import type { SessionUser } from "@/lib/auth";

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

const commissionSourceTypes = `
  'COMMISSION_TOP_DISTRIBUTOR',
  'COMMISSION_DISTRIBUTOR',
  'COMMISSION_SUB_DISTRIBUTOR',
  'COMMISSION_PARTNER_1',
  'COMMISSION_PARTNER_2',
  'COMMISSION_PARTNER_3'
`;

async function getFeeRecordScope(user: SessionUser): Promise<ScopedClause> {
  if (user.role === "TOP_DISTRIBUTOR" || user.role === "ADMIN") {
    return {
      sql: "and recipient_dist.admin_id = $1::uuid",
      values: [user.id],
    };
  }

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

function consolidateOwnFeeRecords(rows: FeeRecordRow[]) {
  const consolidated = new Map<string, FeeRecordRow>();

  for (const row of rows) {
    const separatorIndex = row.id.indexOf(":");
    const chargeRequestId = separatorIndex === -1
      ? row.id
      : row.id.slice(0, separatorIndex);
    const existing = consolidated.get(chargeRequestId);

    if (!existing) {
      consolidated.set(chargeRequestId, { ...row, id: chargeRequestId });
      continue;
    }

    const fee = existing.fee + row.fee;
    consolidated.set(chargeRequestId, {
      ...existing,
      fee,
      feeRate:
        existing.amount > 0
          ? Math.round((fee / existing.amount) * 100 * 10000) / 10000
          : 0,
    });
  }

  return [...consolidated.values()];
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
      with fee_rows as (
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
          coalesce(cr.processed_at, t.created_at) as acquired_at,
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
          and t.source_type in (${commissionSourceTypes})
          and t.amount > 0
          and (coalesce(cr.processed_at, t.created_at) at time zone '${KOREA_TIME_ZONE}')::date >= $1::date
          and (coalesce(cr.processed_at, t.created_at) at time zone '${KOREA_TIME_ZONE}')::date <= $2::date
          ${scopeSql}

        union all

        select
          concat(co.charge_request_id::text, ':LEGACY_TOP:', recipient_dist.id::text) as id,
          recipient_dist.name as top_agent,
          case
            when dist.id is not null and dist.id <> recipient_dist.id then dist.name
            else null
          end as sub_agent,
          recipient_dist.name as acquisition_branch,
          coalesce(nullif(d.domain_name, ''), c.company_name, '-') as domain,
          cr.user_uid as uid,
          co.charge_amount::text as amount,
          case
            when co.charge_amount > 0 then round((co.distributor_fee / co.charge_amount) * 100, 4)
            else 0
          end::text as fee_rate,
          co.distributor_fee::text as fee,
          cr.bank_name,
          coalesce(cr.processed_at, co.created_at) as acquired_at,
          cr.requested_at
        from commission_records co
        join charge_requests cr on cr.id = co.charge_request_id
        join companies c on c.id = co.company_id
        left join domains d on d.id = co.domain_id
        join distributors dist on dist.id = co.distributor_id
        left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
        join distributors recipient_dist on recipient_dist.id = coalesce(parent_dist.id, dist.id)
        left join admins recipient_admin on recipient_admin.id = recipient_dist.admin_id
        where
          co.status in ('APPROVED', 'COMPLETED')
          and cr.status in ('APPROVED', 'COMPLETED')
          and co.distributor_fee > 0
          and (coalesce(cr.processed_at, co.created_at) at time zone '${KOREA_TIME_ZONE}')::date >= $1::date
          and (coalesce(cr.processed_at, co.created_at) at time zone '${KOREA_TIME_ZONE}')::date <= $2::date
          and not exists (
            select 1
            from distributor_balance_transactions split
            where split.source_id = co.charge_request_id
              and split.source_type in (${commissionSourceTypes})
              and split.amount > 0
          )
          ${scopeSql}

        union all

        select
          concat(co.charge_request_id::text, ':LEGACY_DISTRIBUTOR:', recipient_dist.id::text) as id,
          parent_dist.name as top_agent,
          recipient_dist.name as sub_agent,
          recipient_dist.name as acquisition_branch,
          coalesce(nullif(d.domain_name, ''), c.company_name, '-') as domain,
          cr.user_uid as uid,
          co.charge_amount::text as amount,
          case
            when co.charge_amount > 0
              then round((greatest(co.saved_commission - co.company_fee - co.distributor_fee, 0) / co.charge_amount) * 100, 4)
            else 0
          end::text as fee_rate,
          greatest(co.saved_commission - co.company_fee - co.distributor_fee, 0)::text as fee,
          cr.bank_name,
          coalesce(cr.processed_at, co.created_at) as acquired_at,
          cr.requested_at
        from commission_records co
        join charge_requests cr on cr.id = co.charge_request_id
        join companies c on c.id = co.company_id
        left join domains d on d.id = co.domain_id
        join distributors recipient_dist on recipient_dist.id = co.distributor_id
        join distributors parent_dist on parent_dist.id = recipient_dist.parent_distributor_id
        left join admins recipient_admin on recipient_admin.id = recipient_dist.admin_id
        where
          co.status in ('APPROVED', 'COMPLETED')
          and cr.status in ('APPROVED', 'COMPLETED')
          and greatest(co.saved_commission - co.company_fee - co.distributor_fee, 0) > 0
          and (coalesce(cr.processed_at, co.created_at) at time zone '${KOREA_TIME_ZONE}')::date >= $1::date
          and (coalesce(cr.processed_at, co.created_at) at time zone '${KOREA_TIME_ZONE}')::date <= $2::date
          and not exists (
            select 1
            from distributor_balance_transactions split
            where split.source_id = co.charge_request_id
              and split.source_type in (${commissionSourceTypes})
              and split.amount > 0
          )
          ${scopeSql}
      )
      select *
      from fee_rows
      order by acquired_at desc
    `,
    values,
  );
  const feeRows = result.rows.map(toFeeRecord);
  const rows =
    user.role === "TOP_DISTRIBUTOR" || user.role === "ADMIN"
      ? consolidateOwnFeeRecords(feeRows)
      : feeRows;

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

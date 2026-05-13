import { getFeeRecords } from "@/lib/mock-report-service";
import { hasDatabaseUrl, query } from "@/lib/db";
import { getScopedDistributorCondition } from "@/lib/master-scope";
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

function formatStamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function toFeeRecord(row: FeeRecordDbRow): FeeRecordRow {
  return {
    id: row.id,
    topAgent: row.top_agent ?? "마스터 관리자",
    subAgent: row.sub_agent ?? "-",
    acquisitionBranch: row.sub_agent ?? "-",
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
  const scope = getScopedDistributorCondition(user);

  const result = await query<FeeRecordDbRow>(
    `
      select
        cr.id::text,
        owner_master.name as top_agent,
        dist.name as sub_agent,
        coalesce(dist.name, c.company_name) as acquisition_branch,
        coalesce(d.domain_name, '-') as domain,
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
      left join admins dist_admin on dist_admin.id = dist.admin_id
      left join admins owner_master on owner_master.id = dist_admin.created_by
      where
        co.status in ('APPROVED', 'COMPLETED')
        and co.created_at >= $1::date
        and co.created_at < ($2::date + interval '1 day')
        ${scope.sql.replace("$1", "$3")}
      order by co.created_at desc
      limit ${DEFAULT_ROW_LIMIT}
    `,
    [startDate, endDate, user.id],
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

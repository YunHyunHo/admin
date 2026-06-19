import { hasDatabaseUrl, query } from "@/lib/db";
import { formatKoreanDateTime } from "@/lib/korean-time";
import {
  getMasterOwnedBankAccountCondition,
  getScopedDataCondition,
} from "@/lib/master-scope";
import type { SessionUser } from "@/lib/auth";
import type { LedgerRow, TransactionStatus } from "@/lib/transaction-ledger-types";

const DEFAULT_ROW_LIMIT = 200;

type TransactionLedgerDbRow = {
  id: string;
  request_type: "CHARGE" | "EXCHANGE";
  user_uid: string;
  top_distributor_name: string | null;
  distributor_name: string | null;
  child_distributor_names: string | null;
  domain_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  depositor: string | null;
  amount: string;
  fee: string;
  requested_at: Date | string;
  processed_at: Date | string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELED";
};

function formatStamp(value: Date | string | null) {
  return formatKoreanDateTime(value, { includeYear: true });
}

function toStatus(status: TransactionLedgerDbRow["status"]): TransactionStatus {
  if (status === "PENDING") {
    return "승인중";
  }

  return status === "REJECTED" || status === "CANCELED" ? "승인취소" : "완료";
}

function toBankInfo(row: TransactionLedgerDbRow) {
  const parts = [row.bank_name, row.account_number].filter(Boolean);

  return parts.length ? parts.join(" / ") : "-";
}

function toLedgerRow(row: TransactionLedgerDbRow): LedgerRow {
  const distributorName =
    row.distributor_name ?? row.child_distributor_names ?? "하부계정 없음";
  const bankName = row.bank_name ?? "-";
  const accountNumber = row.account_number ?? "-";
  const accountHolder = row.account_holder ?? "-";

  return {
    id: `${row.request_type}-${row.id}`,
    transactionType: row.request_type === "CHARGE" ? "충전" : "환전",
    branch: distributorName,
    userId: row.user_uid,
    topDistributor: row.top_distributor_name ?? distributorName,
    distributor: distributorName,
    domain: row.domain_name ?? "-",
    companyName: row.domain_name ?? distributorName,
    bankInfo: toBankInfo(row),
    bankName,
    accountNumber,
    accountHolder,
    depositor: row.depositor ?? row.account_holder ?? "-",
    amount: Number(row.amount),
    fee: Number(row.fee),
    requestedAt: formatStamp(row.requested_at),
    completedAt: formatStamp(row.processed_at),
    status: toStatus(row.status),
  };
}

export async function getTransactionLedgerRows(
  fallbackRows: LedgerRow[],
  user?: SessionUser,
) {
  if (!hasDatabaseUrl()) {
    return fallbackRows;
  }
  const chargeScope = user
    ? await getScopedDataCondition(user, {
        company: "cr",
        distributor: "dist",
        distributorAdmin: "dist_admin",
      })
    : { sql: "", values: [] as string[] };
  const exchangeScope = user
    ? await getScopedDataCondition(user, {
        company: "er",
        distributor: "dist",
        distributorAdmin: "dist_admin",
      })
    : { sql: "", values: [] as string[] };
  const bankAccountScopeSql =
    user?.role === "MASTER"
      ? `and ${getMasterOwnedBankAccountCondition("ba")}`
      : "";

  const result = await query<TransactionLedgerDbRow>(
    `
      select *
      from (
        select
          cr.id::text,
          'CHARGE'::text as request_type,
          cr.user_uid,
          coalesce(parent_dist.name, dist.name) as top_distributor_name,
          case when parent_dist.id is null then null else dist.name end as distributor_name,
          child_dist.names as child_distributor_names,
          dom.domain_name,
          coalesce(nullif(cr.bank_name, ''), charge_account.bank_name) as bank_name,
          coalesce(nullif(cr.account_number, ''), charge_account.account_number) as account_number,
          coalesce(
            (
              select ba.account_holder
              from bank_accounts ba
              where ba.distributor_id = dist.id
                ${bankAccountScopeSql}
                and ba.bank_name = coalesce(nullif(cr.bank_name, ''), charge_account.bank_name)
                and ba.account_number = coalesce(nullif(cr.account_number, ''), charge_account.account_number)
              order by ba.is_active desc, ba.created_at desc
              limit 1
            ),
            charge_account.account_holder
          )::text as account_holder,
          cr.depositor,
          cr.amount::text,
          coalesce(co.saved_commission, 0)::text as fee,
          cr.requested_at,
          cr.processed_at,
          cr.status::text as status
        from charge_requests cr
        left join domains dom on dom.id = cr.domain_id
        left join distributors dist on dist.id = cr.distributor_id
        left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
        left join lateral (
          select ba.bank_name, ba.account_number, ba.account_holder
          from bank_accounts ba
          where ba.is_active = true
            ${bankAccountScopeSql}
            and (
              (
                ba.company_id = cr.company_id
                and (
                  ba.distributor_id = cr.distributor_id
                  or ba.distributor_id is null
                )
              )
              or (
                ba.distributor_id = cr.distributor_id
                and ba.company_id is null
              )
            )
          order by
            case
              when ba.company_id = cr.company_id and ba.distributor_id = cr.distributor_id then 0
              when ba.company_id = cr.company_id and ba.distributor_id is null then 1
              when ba.distributor_id = cr.distributor_id then 2
              else 3
            end,
            ba.created_at desc
          limit 1
        ) charge_account on true
        left join lateral (
          select string_agg(child.name, ', ' order by child.name) as names
          from distributors child
          where child.parent_distributor_id = dist.id
            and child.status = 'ACTIVE'
        ) child_dist on parent_dist.id is null
        left join commission_records co on co.charge_request_id = cr.id
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where 1 = 1
          ${chargeScope.sql}

        union all

        select
          er.id::text,
          'EXCHANGE'::text as request_type,
          er.user_uid,
          coalesce(parent_dist.name, dist.name) as top_distributor_name,
          case when parent_dist.id is null then null else dist.name end as distributor_name,
          child_dist.names as child_distributor_names,
          dom.domain_name,
          er.bank_name,
          er.account_number,
          er.account_holder,
          er.account_holder as depositor,
          er.amount::text,
          0::text as fee,
          er.requested_at,
          er.processed_at,
          er.status::text as status
        from exchange_requests er
        join domains dom on dom.id = er.domain_id
        left join distributors dist on dist.id = er.distributor_id
        left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
        left join lateral (
          select string_agg(child.name, ', ' order by child.name) as names
          from distributors child
          where child.parent_distributor_id = dist.id
            and child.status = 'ACTIVE'
        ) child_dist on parent_dist.id is null
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where 1 = 1
          ${exchangeScope.sql}
      ) ledger
      order by requested_at desc
      limit ${DEFAULT_ROW_LIMIT}
    `,
    chargeScope.values.length ? chargeScope.values : exchangeScope.values,
  );

  return result.rows.map(toLedgerRow);
}

import { hasDatabaseUrl, query } from "@/lib/db";
import type { LedgerRow, TransactionStatus } from "@/lib/transaction-ledger-types";

type TransactionLedgerDbRow = {
  id: string;
  request_type: "CHARGE" | "EXCHANGE";
  user_uid: string;
  master_name: string | null;
  distributor_name: string | null;
  domain_name: string;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  depositor: string | null;
  amount: string;
  requested_at: Date | string;
  processed_at: Date | string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELED";
};

function formatStamp(value: Date | string | null) {
  if (!value) {
    return "-";
  }

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

function toStatus(status: TransactionLedgerDbRow["status"]): TransactionStatus {
  return status === "REJECTED" || status === "CANCELED" ? "승인취소" : "승인";
}

function toBankInfo(row: TransactionLedgerDbRow) {
  const parts = [row.bank_name, row.account_number, row.account_holder].filter(Boolean);

  return parts.length ? parts.join(" / ") : "-";
}

function toLedgerRow(row: TransactionLedgerDbRow): LedgerRow {
  const distributorName = row.distributor_name ?? "하부계정 없음";

  return {
    id: `${row.request_type}-${row.id}`,
    branch: distributorName,
    userId: row.request_type === "EXCHANGE" ? "업체 환전" : row.user_uid,
    topDistributor: row.master_name ?? "마스터 관리자",
    distributor: distributorName,
    domain: row.domain_name,
    bankInfo: toBankInfo(row),
    depositor: row.depositor ?? row.account_holder ?? "-",
    amount: Number(row.amount),
    requestedAt: formatStamp(row.requested_at),
    completedAt: formatStamp(row.processed_at),
    status: toStatus(row.status),
  };
}

export async function getTransactionLedgerRows(fallbackRows: LedgerRow[]) {
  if (!hasDatabaseUrl()) {
    return fallbackRows;
  }

  const result = await query<TransactionLedgerDbRow>(
    `
      select *
      from (
        select
          cr.id::text,
          'CHARGE'::text as request_type,
          cr.user_uid,
          master.name as master_name,
          dist.name as distributor_name,
          dom.domain_name,
          cr.bank_name,
          cr.account_number,
          null::text as account_holder,
          cr.depositor,
          cr.amount::text,
          cr.requested_at,
          cr.processed_at,
          cr.status::text as status
        from charge_requests cr
        join domains dom on dom.id = cr.domain_id
        left join distributors dist on dist.id = cr.distributor_id
        left join admins master on master.role = 'MASTER' and master.status = 'ACTIVE'

        union all

        select
          er.id::text,
          'EXCHANGE'::text as request_type,
          er.user_uid,
          master.name as master_name,
          dist.name as distributor_name,
          dom.domain_name,
          er.bank_name,
          er.account_number,
          er.account_holder,
          er.account_holder as depositor,
          er.amount::text,
          er.requested_at,
          er.processed_at,
          er.status::text as status
        from exchange_requests er
        join domains dom on dom.id = er.domain_id
        left join distributors dist on dist.id = er.distributor_id
        left join admins master on master.role = 'MASTER' and master.status = 'ACTIVE'
      ) ledger
      order by requested_at desc
    `,
  );

  return result.rows.map(toLedgerRow);
}

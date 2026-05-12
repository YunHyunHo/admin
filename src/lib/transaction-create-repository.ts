import { hasDatabaseUrl, query } from "@/lib/db";
import type { TransactionCreateRow } from "@/lib/transaction-create-types";

type TransactionCreateDbRow = {
  id: string;
  user_uid: string;
  domain_name: string;
  bank_name: string | null;
  account_number: string | null;
  depositor: string | null;
  amount: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELED";
  requested_at: Date | string;
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

function toBankInfo(row: TransactionCreateDbRow) {
  const parts = [row.bank_name, row.account_number].filter(Boolean);

  return parts.length ? parts.join(" / ") : "-";
}

function toTransactionCreateRow(row: TransactionCreateDbRow): TransactionCreateRow {
  const amount = Number(row.amount);

  return {
    id: row.id,
    tradedAt: formatStamp(row.requested_at),
    buyerWallet: row.user_uid,
    coin: row.domain_name,
    quantity: Math.max(1, Math.floor(amount / 10000)),
    depositor: row.depositor ?? "-",
    amount,
    status:
      row.status === "APPROVED" || row.status === "COMPLETED" ? "완료" : "대기",
    bankInfo: toBankInfo(row),
  };
}

export async function getTransactionCreateRows(
  fallbackRows: TransactionCreateRow[],
) {
  if (!hasDatabaseUrl()) {
    return fallbackRows;
  }

  const result = await query<TransactionCreateDbRow>(
    `
      select
        cr.id::text,
        cr.user_uid,
        dom.domain_name,
        cr.bank_name,
        cr.account_number,
        cr.depositor,
        cr.amount::text,
        cr.status::text as status,
        cr.requested_at
      from charge_requests cr
      join domains dom on dom.id = cr.domain_id
      order by cr.requested_at desc
    `,
  );

  return result.rows.map(toTransactionCreateRow);
}

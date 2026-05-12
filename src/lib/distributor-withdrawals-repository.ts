import { hasDatabaseUrl, query } from "@/lib/db";

export type DistributorWithdrawalRow = {
  id: string;
  topDistributor: string;
  withdrawalBranch: string;
  currentBalance: number;
  requester: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  requestAmount: number;
  requestedAt: string;
  completedAt: string;
  status: "승인" | "승인취소";
};

type WithdrawalDbRow = {
  id: string;
  master_name: string | null;
  distributor_name: string;
  current_balance: string;
  bank_name: string;
  account_holder: string;
  account_number: string;
  request_amount: string;
  requested_at: Date | string;
  processed_at: Date | string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELED";
};

type BalanceDbRow = {
  id: string;
  master_name: string | null;
  name: string;
  current_balance: string;
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

function toStatus(status: WithdrawalDbRow["status"]): DistributorWithdrawalRow["status"] {
  return status === "REJECTED" || status === "CANCELED" ? "승인취소" : "승인";
}

function toWithdrawalRow(row: WithdrawalDbRow): DistributorWithdrawalRow {
  return {
    id: row.id,
    topDistributor: row.master_name ?? "마스터 관리자",
    withdrawalBranch: row.distributor_name,
    currentBalance: Number(row.current_balance),
    requester: row.distributor_name,
    bankName: row.bank_name,
    accountHolder: row.account_holder,
    accountNumber: row.account_number,
    requestAmount: Number(row.request_amount),
    requestedAt: formatStamp(row.requested_at),
    completedAt: formatStamp(row.processed_at),
    status: toStatus(row.status),
  };
}

export async function getDistributorWithdrawalRows(
  fallbackRows: DistributorWithdrawalRow[],
) {
  if (!hasDatabaseUrl()) {
    return fallbackRows;
  }

  const withdrawals = await query<WithdrawalDbRow>(
    `
      select
        dw.id::text,
        master.name as master_name,
        d.name as distributor_name,
        d.current_balance::text,
        dw.bank_name,
        dw.account_holder,
        dw.account_number,
        dw.request_amount::text,
        dw.requested_at,
        dw.processed_at,
        dw.status::text as status
      from distributor_withdrawals dw
      join distributors d on d.id = dw.distributor_id
      left join admins master on master.role = 'MASTER' and master.status = 'ACTIVE'
      order by dw.requested_at desc
    `,
  );

  if (withdrawals.rows.length) {
    return withdrawals.rows.map(toWithdrawalRow);
  }

  const balances = await query<BalanceDbRow>(
    `
      select
        d.id::text,
        master.name as master_name,
        d.name,
        d.current_balance::text
      from distributors d
      left join admins master on master.role = 'MASTER' and master.status = 'ACTIVE'
      where d.status = 'ACTIVE'
      order by d.created_at desc
    `,
  );

  return balances.rows.map((row) => ({
    id: row.id,
    topDistributor: row.master_name ?? "마스터 관리자",
    withdrawalBranch: row.name,
    currentBalance: Number(row.current_balance),
    requester: row.name,
    bankName: "-",
    accountHolder: "-",
    accountNumber: "-",
    requestAmount: 0,
    requestedAt: "-",
    completedAt: "-",
    status: "승인" as const,
  }));
}

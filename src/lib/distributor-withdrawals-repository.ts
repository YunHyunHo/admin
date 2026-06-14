import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";
import { formatKoreanDateTime } from "@/lib/korean-time";
import { getScopedDistributorCondition } from "@/lib/master-scope";
import type { SessionUser } from "@/lib/auth";

const DEFAULT_ROW_LIMIT = 200;

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
  status: "승인중" | "승인" | "승인거절";
};

type WithdrawalDbRow = {
  id: string;
  top_distributor_name: string | null;
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
  top_distributor_name: string | null;
  name: string;
  current_balance: string;
};

type CreateDistributorWithdrawalInput = {
  amount: number;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  user: SessionUser;
};

type DistributorScopeRow = {
  company_id: string;
  distributor_id: string;
  current_balance: string;
};

type ProcessingWithdrawalRow = {
  id: string;
  distributor_id: string;
  request_amount: string;
  current_balance: string;
  status: WithdrawalDbRow["status"];
};

function formatStamp(value: Date | string | null) {
  return formatKoreanDateTime(value);
}

function toStatus(status: WithdrawalDbRow["status"]): DistributorWithdrawalRow["status"] {
  if (status === "PENDING") {
    return "승인중";
  }

  return status === "REJECTED" || status === "CANCELED" ? "승인거절" : "승인";
}

function toWithdrawalRow(row: WithdrawalDbRow): DistributorWithdrawalRow {
  const topDistributorName = row.top_distributor_name ?? "-";
  const distributorName = row.distributor_name === "-" ? topDistributorName : row.distributor_name;

  return {
    id: row.id,
    topDistributor: topDistributorName,
    withdrawalBranch: distributorName,
    currentBalance: Number(row.current_balance),
    requester: distributorName,
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
  user?: SessionUser,
) {
  if (!hasDatabaseUrl()) {
    return fallbackRows;
  }
  const scope = user
    ? user.role === "MASTER"
      ? { sql: "", values: [] as string[] }
      : getScopedDistributorCondition(user, "d", "dist_admin")
    : { sql: "", values: [] as string[] };

  const withdrawals = await query<WithdrawalDbRow>(
    `
      select
        dw.id::text,
        coalesce(parent_dist.name, d.name) as top_distributor_name,
        case when parent_dist.id is null then '-' else d.name end as distributor_name,
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
      left join distributors parent_dist on parent_dist.id = d.parent_distributor_id
      left join admins dist_admin on dist_admin.id = d.admin_id
      where 1 = 1
        ${scope.sql}
      order by dw.requested_at desc
      limit ${DEFAULT_ROW_LIMIT}
    `,
    scope.values,
  );

  if (withdrawals.rows.length) {
    return withdrawals.rows.map(toWithdrawalRow);
  }

  const balances = await query<BalanceDbRow>(
    `
      select
        d.id::text,
        coalesce(parent_dist.name, d.name) as top_distributor_name,
        d.name,
        d.current_balance::text
      from distributors d
      left join distributors parent_dist on parent_dist.id = d.parent_distributor_id
      left join admins dist_admin on dist_admin.id = d.admin_id
      where d.status = 'ACTIVE'
        ${scope.sql}
      order by d.created_at desc
      limit ${DEFAULT_ROW_LIMIT}
    `,
    scope.values,
  );

  return balances.rows.map((row) => ({
    id: row.id,
    topDistributor: row.top_distributor_name ?? "-",
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

export async function createDistributorWithdrawal(input: CreateDistributorWithdrawalInput) {
  const distributor = await query<DistributorScopeRow>(
    `
      select
        dist.company_id::text,
        dist.id::text as distributor_id,
        dist.current_balance::text
      from distributors dist
      where dist.status = 'ACTIVE'
        and dist.admin_id = $1::uuid
      order by dist.created_at desc
      limit 1
    `,
    [input.user.id],
  );
  const distributorScope = distributor.rows[0];

  if (!distributorScope) {
    throw new Error("환전신청을 연결할 하부계정을 찾을 수 없습니다.");
  }

  const beforeBalance = Number(distributorScope.current_balance);
  const afterBalance = beforeBalance - input.amount;

  if (afterBalance < 0) {
    throw new Error("보유액보다 큰 금액은 신청할 수 없습니다.");
  }

  const result = await query<{ id: string }>(
    `
      insert into distributor_withdrawals (
        distributor_id,
        request_amount,
        before_balance,
        after_balance,
        bank_name,
        account_number,
        account_holder,
        status,
        requested_at
      )
      values (
        $1::uuid,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        'PENDING',
        now()
      )
      returning id::text
    `,
    [
      distributorScope.distributor_id,
      input.amount,
      beforeBalance,
      afterBalance,
      input.bankName,
      input.accountNumber,
      input.accountHolder,
    ],
  );

  return result.rows[0]?.id;
}

export async function approveDistributorWithdrawal(id: string, processedBy: SessionUser) {
  await withTransaction(async (client) => {
    const processingScopeSql =
      processedBy.role === "MASTER" ? "" : "and dist_admin.created_by = $2::uuid";
    const processingValues =
      processedBy.role === "MASTER" ? [id] : [id, processedBy.id];
    const withdrawal = await client.query<ProcessingWithdrawalRow>(
      `
        select
          dw.id::text,
          dw.distributor_id::text,
          dw.request_amount::text,
          d.current_balance::text,
          dw.status::text as status
        from distributor_withdrawals dw
        join distributors d on d.id = dw.distributor_id
        left join admins dist_admin on dist_admin.id = d.admin_id
        where dw.id = $1::uuid
          ${processingScopeSql}
        for update of dw, d
      `,
      processingValues,
    );
    const row = withdrawal.rows[0];

    if (!row) {
      throw new Error("처리할 총판 환전 요청을 찾을 수 없습니다.");
    }

    if (row.status !== "PENDING") {
      return;
    }

    const requestAmount = Number(row.request_amount);
    const beforeBalance = Number(row.current_balance);
    const afterBalance = beforeBalance - requestAmount;

    if (afterBalance < 0) {
      throw new Error("보유액보다 큰 환전 요청은 승인할 수 없습니다.");
    }

    await client.query(
      `
        update distributors
        set current_balance = $2,
            updated_at = now()
        where id = $1::uuid
      `,
      [row.distributor_id, afterBalance],
    );

    await client.query(
      `
        update distributor_withdrawals
        set status = 'APPROVED',
            before_balance = $2,
            after_balance = $3,
            processed_at = coalesce(processed_at, now()),
            processed_by = $4::uuid,
            balance_deducted_at = coalesce(balance_deducted_at, now()),
            updated_at = now()
        where id = $1::uuid
      `,
      [id, beforeBalance, afterBalance, processedBy.id],
    );

    await client.query(
      `
        insert into distributor_balance_transactions (
          distributor_id,
          amount,
          balance_before,
          balance_after,
          source_type,
          source_id,
          memo,
          created_by
        )
        values (
          $1::uuid,
          $2,
          $3,
          $4,
          'DISTRIBUTOR_WITHDRAWAL',
          $5::uuid,
          '총판 환전 승인',
          $6::uuid
        )
        on conflict (source_type, source_id) do nothing
      `,
      [row.distributor_id, -requestAmount, beforeBalance, afterBalance, id, processedBy.id],
    );
  });
}

export async function rejectDistributorWithdrawal(id: string, processedBy: SessionUser) {
  const processingScopeSql =
    processedBy.role === "MASTER" ? "" : "and dist_admin.created_by = $2::uuid";
  const result = await query<{ id: string }>(
    `
      update distributor_withdrawals dw
      set status = 'REJECTED',
          processed_at = coalesce(dw.processed_at, now()),
          processed_by = $2::uuid,
          updated_at = now()
      from distributors d
      left join admins dist_admin on dist_admin.id = d.admin_id
      where dw.id = $1::uuid
        and dw.distributor_id = d.id
        ${processingScopeSql}
        and dw.status = 'PENDING'
      returning dw.id::text
    `,
    [id, processedBy.id],
  );

  if (!result.rows[0]) {
    throw new Error("처리할 총판 환전 요청을 찾을 수 없습니다.");
  }
}

export async function cancelDistributorWithdrawal(id: string, processedBy: SessionUser) {
  await withTransaction(async (client) => {
    const processingScopeSql =
      processedBy.role === "MASTER" ? "" : "and dist_admin.created_by = $2::uuid";
    const processingValues =
      processedBy.role === "MASTER" ? [id] : [id, processedBy.id];
    const withdrawal = await client.query<ProcessingWithdrawalRow>(
      `
        select
          dw.id::text,
          dw.distributor_id::text,
          dw.request_amount::text,
          d.current_balance::text,
          dw.status::text as status
        from distributor_withdrawals dw
        join distributors d on d.id = dw.distributor_id
        left join admins dist_admin on dist_admin.id = d.admin_id
        where dw.id = $1::uuid
          ${processingScopeSql}
          and dw.status in ('APPROVED', 'COMPLETED')
        for update of dw, d
      `,
      processingValues,
    );
    const row = withdrawal.rows[0];

    if (!row) {
      throw new Error("승인취소할 총판 환전 요청을 찾을 수 없습니다.");
    }

    const requestAmount = Number(row.request_amount);
    const beforeBalance = Number(row.current_balance);
    const afterBalance = beforeBalance + requestAmount;

    await client.query(
      `
        update distributors
        set current_balance = $2,
            updated_at = now()
        where id = $1::uuid
      `,
      [row.distributor_id, afterBalance],
    );

    await client.query(
      `
        update distributor_withdrawals
        set status = 'CANCELED',
            before_balance = $2,
            after_balance = $3,
            processed_at = now(),
            processed_by = $4::uuid,
            updated_at = now()
        where id = $1::uuid
          and status in ('APPROVED', 'COMPLETED')
      `,
      [id, beforeBalance, afterBalance, processedBy.id],
    );

    await client.query(
      `
        insert into distributor_balance_transactions (
          distributor_id,
          amount,
          balance_before,
          balance_after,
          source_type,
          source_id,
          memo,
          created_by
        )
        values (
          $1::uuid,
          $2,
          $3,
          $4,
          'DISTRIBUTOR_WITHDRAWAL_CANCEL',
          $5::uuid,
          '총판 환전 승인취소',
          $6::uuid
        )
        on conflict (source_type, source_id) do nothing
      `,
      [row.distributor_id, requestAmount, beforeBalance, afterBalance, id, processedBy.id],
    );
  });
}

import type { PoolClient, QueryResultRow } from "pg";

import type { SessionUser } from "@/lib/auth";
import { formatKoreanDateTime } from "@/lib/korean-time";
import { query, withTransaction } from "@/lib/db";

type QueryExecutor = {
  query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

type AmountRow = {
  amount: string;
};

type HeadquartersWithdrawalDbRow = {
  id: string;
  request_amount: string;
  before_balance: string;
  after_balance: string;
  bank_name: string;
  account_holder: string;
  account_number: string;
  requested_at: Date | string;
  processed_at: Date | string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
};

export type HeadquartersWithdrawalRow = {
  id: string;
  amount: number;
  beforeBalance: number;
  afterBalance: number;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  requestedAt: string;
  processedAt: string;
  status: "승인중" | "승인" | "승인거절" | "승인취소";
};

export type HeadquartersAccountSnapshot = {
  earnedTotal: number;
  withdrawnTotal: number;
  pendingTotal: number;
  currentBalance: number;
  availableBalance: number;
  withdrawals: HeadquartersWithdrawalRow[];
};

let schemaPromise: Promise<void> | null = null;

async function ensureHeadquartersWithdrawalSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await query(`
        create table if not exists headquarters_withdrawals (
          id uuid primary key default gen_random_uuid(),
          master_admin_id uuid not null references admins(id),
          request_amount numeric(18, 0) not null,
          before_balance numeric(18, 0) not null,
          after_balance numeric(18, 0) not null,
          bank_name text not null,
          account_number text not null,
          account_holder text not null,
          status text not null default 'PENDING',
          requested_at timestamptz not null default now(),
          processed_at timestamptz,
          processed_by uuid references admins(id),
          created_by uuid not null references admins(id),
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          check (request_amount > 0),
          check (before_balance >= 0),
          check (after_balance >= 0),
          check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED'))
        )
      `);
      await query(`
        create index if not exists headquarters_withdrawals_master_requested_idx
          on headquarters_withdrawals (master_admin_id, requested_at desc)
      `);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  await schemaPromise;
}

function assertMaster(user: Pick<SessionUser, "role">) {
  if (user.role !== "MASTER") {
    throw new Error("본사 잔액을 관리할 권한이 없습니다.");
  }
}

async function getEarnedTotal(executor: QueryExecutor, masterAdminId: string) {
  const result = await executor.query<AmountRow>(
    `
      select coalesce(sum(co.company_fee), 0)::text as amount
      from commission_records co
      join companies c on c.id = co.company_id
      where co.status in ('APPROVED', 'COMPLETED')
        and (
          c.owner_master_id = $1::uuid
          or (
            c.owner_master_id is null
            and exists (
              select 1
              from admin_company_mappings acm
              join admins company_admin on company_admin.id = acm.admin_id
              where acm.company_id = c.id
                and company_admin.created_by = $1::uuid
                and company_admin.role = 'DOMAIN_ADMIN'
                and company_admin.status <> 'DELETED'
            )
          )
        )
    `,
    [masterAdminId],
  );

  return Number(result.rows[0]?.amount ?? 0);
}

async function getWithdrawalTotal(
  executor: QueryExecutor,
  masterAdminId: string,
  status: "PENDING" | "APPROVED",
) {
  const result = await executor.query<AmountRow>(
    `
      select coalesce(sum(request_amount), 0)::text as amount
      from headquarters_withdrawals
      where master_admin_id = $1::uuid
        and status = $2
    `,
    [masterAdminId, status],
  );

  return Number(result.rows[0]?.amount ?? 0);
}

function toWithdrawalRow(row: HeadquartersWithdrawalDbRow): HeadquartersWithdrawalRow {
  const statusMap = {
    PENDING: "승인중",
    APPROVED: "승인",
    REJECTED: "승인거절",
    CANCELED: "승인취소",
  } as const;

  return {
    id: row.id,
    amount: Number(row.request_amount),
    beforeBalance: Number(row.before_balance),
    afterBalance: Number(row.after_balance),
    bankName: row.bank_name,
    accountHolder: row.account_holder,
    accountNumber: row.account_number,
    requestedAt: formatKoreanDateTime(row.requested_at),
    processedAt: row.processed_at ? formatKoreanDateTime(row.processed_at) : "-",
    status: statusMap[row.status],
  };
}

export async function getHeadquartersAccountSnapshot(
  user: Pick<SessionUser, "id" | "role">,
): Promise<HeadquartersAccountSnapshot | null> {
  if (user.role !== "MASTER") {
    return null;
  }

  await ensureHeadquartersWithdrawalSchema();
  const [earnedTotal, withdrawnTotal, pendingTotal, withdrawalResult] = await Promise.all([
    getEarnedTotal({ query }, user.id),
    getWithdrawalTotal({ query }, user.id, "APPROVED"),
    getWithdrawalTotal({ query }, user.id, "PENDING"),
    query<HeadquartersWithdrawalDbRow>(
      `
        select
          id::text,
          request_amount::text,
          before_balance::text,
          after_balance::text,
          bank_name,
          account_holder,
          account_number,
          requested_at,
          processed_at,
          status
        from headquarters_withdrawals
        where master_admin_id = $1::uuid
        order by requested_at desc
        limit 100
      `,
      [user.id],
    ),
  ]);

  return {
    earnedTotal,
    withdrawnTotal,
    pendingTotal,
    currentBalance: Math.max(0, earnedTotal - withdrawnTotal),
    availableBalance: Math.max(0, earnedTotal - withdrawnTotal - pendingTotal),
    withdrawals: withdrawalResult.rows.map(toWithdrawalRow),
  };
}

type CreateHeadquartersWithdrawalInput = {
  user: SessionUser;
  amount: number;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
};

export async function createHeadquartersWithdrawal(
  input: CreateHeadquartersWithdrawalInput,
) {
  assertMaster(input.user);
  await ensureHeadquartersWithdrawalSchema();

  await withTransaction(async (client: PoolClient) => {
    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `headquarters-balance:${input.user.id}`,
    ]);

    const earnedTotal = await getEarnedTotal(client, input.user.id);
    const withdrawnTotal = await getWithdrawalTotal(client, input.user.id, "APPROVED");
    const pendingTotal = await getWithdrawalTotal(client, input.user.id, "PENDING");
    const beforeBalance = earnedTotal - withdrawnTotal;

    if (input.amount > beforeBalance - pendingTotal) {
      throw new Error("본사 잔액보다 큰 금액은 환전할 수 없습니다.");
    }

    const afterBalance = beforeBalance - input.amount;
    const inserted = await client.query<{ id: string }>(
      `
        insert into headquarters_withdrawals (
          master_admin_id,
          request_amount,
          before_balance,
          after_balance,
          bank_name,
          account_number,
          account_holder,
          status,
          requested_at,
          created_by
        )
        values ($1::uuid, $2, $3, $4, $5, $6, $7, 'PENDING', now(), $1::uuid)
        returning id::text
      `,
      [
        input.user.id,
        input.amount,
        beforeBalance,
        afterBalance,
        input.bankName,
        input.accountNumber,
        input.accountHolder,
      ],
    );
    const withdrawalId = inserted.rows[0]?.id;

    if (!withdrawalId) {
      throw new Error("본사 환전 내역 저장에 실패했습니다.");
    }

    await client.query(
      `
        insert into admin_audit_logs (
          admin_id,
          action,
          resource_type,
          resource_id,
          before_data,
          after_data
        )
        values (
          $1::uuid,
          'HEADQUARTERS_WITHDRAWAL_CREATED',
          'headquarters_withdrawal',
          $2::uuid,
          jsonb_build_object('balance', $3::numeric),
          jsonb_build_object('balance', $4::numeric, 'amount', $5::numeric, 'status', 'PENDING')
        )
      `,
      [input.user.id, withdrawalId, beforeBalance, afterBalance, input.amount],
    );
  });

  return getHeadquartersAccountSnapshot(input.user);
}

type HeadquartersWithdrawalAction = "approve" | "reject" | "cancel";

type ProcessingRow = {
  id: string;
  request_amount: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
};

export async function processHeadquartersWithdrawal(
  id: string,
  action: HeadquartersWithdrawalAction,
  user: SessionUser,
) {
  assertMaster(user);
  await ensureHeadquartersWithdrawalSchema();

  await withTransaction(async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `headquarters-balance:${user.id}`,
    ]);
    const result = await client.query<ProcessingRow>(
      `
        select id::text, request_amount::text, status
        from headquarters_withdrawals
        where id = $1::uuid
          and master_admin_id = $2::uuid
        for update
      `,
      [id, user.id],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("처리할 본사 환전 신청을 찾을 수 없습니다.");
    }

    if (action === "approve") {
      if (row.status !== "PENDING") {
        throw new Error("승인중인 본사 환전 신청만 승인할 수 있습니다.");
      }

      const earnedTotal = await getEarnedTotal(client, user.id);
      const withdrawnTotal = await getWithdrawalTotal(client, user.id, "APPROVED");
      const beforeBalance = earnedTotal - withdrawnTotal;
      const amount = Number(row.request_amount);

      if (amount > beforeBalance) {
        throw new Error("현재 본사 잔액보다 큰 환전 신청은 승인할 수 없습니다.");
      }

      await client.query(
        `
          update headquarters_withdrawals
          set status = 'APPROVED',
              before_balance = $3,
              after_balance = $4,
              processed_at = now(),
              processed_by = $2::uuid,
              updated_at = now()
          where id = $1::uuid
        `,
        [id, user.id, beforeBalance, beforeBalance - amount],
      );
    } else if (action === "reject") {
      if (row.status !== "PENDING") {
        throw new Error("승인중인 본사 환전 신청만 거절할 수 있습니다.");
      }
      await client.query(
        `
          update headquarters_withdrawals
          set status = 'REJECTED', processed_at = now(), processed_by = $2::uuid, updated_at = now()
          where id = $1::uuid
        `,
        [id, user.id],
      );
    } else {
      if (row.status !== "APPROVED") {
        throw new Error("승인된 본사 환전 신청만 승인취소할 수 있습니다.");
      }
      await client.query(
        `
          update headquarters_withdrawals
          set status = 'CANCELED', processed_at = now(), processed_by = $2::uuid, updated_at = now()
          where id = $1::uuid
        `,
        [id, user.id],
      );
    }

    await client.query(
      `
        insert into admin_audit_logs (admin_id, action, resource_type, resource_id, before_data, after_data)
        values (
          $1::uuid,
          $2,
          'headquarters_withdrawal',
          $3::uuid,
          jsonb_build_object('status', $4),
          jsonb_build_object('status', $5)
        )
      `,
      [
        user.id,
        `HEADQUARTERS_WITHDRAWAL_${action.toUpperCase()}`,
        id,
        row.status,
        action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "CANCELED",
      ],
    );
  });

  return getHeadquartersAccountSnapshot(user);
}

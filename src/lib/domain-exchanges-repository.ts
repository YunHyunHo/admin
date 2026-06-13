import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";
import { formatKoreanDateTime } from "@/lib/korean-time";
import { getScopedDataCondition } from "@/lib/master-scope";
import type { PoolClient, QueryResultRow } from "pg";
import type { SessionUser } from "@/lib/auth";
import type {
  DomainExchangeOption,
  DomainExchangeRow,
} from "@/lib/domain-exchanges-types";

const DEFAULT_ROW_LIMIT = 200;

type ExchangeRequestDbRow = {
  id: string;
  user_uid: string | null;
  distributor_name: string | null;
  child_distributor_names: string | null;
  top_distributor_name: string | null;
  domain_name: string | null;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  amount: string;
  requested_at: Date | string;
  processed_at: Date | string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELED";
};

type CreateDomainExchangeInput = {
  externalId?: string;
  userId: string;
  amount: number;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  rawPayload?: unknown;
  domainId?: string | null;
  domainName?: string;
};

type QueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
};

type DomainExchangeBalance = {
  chargeAmount: number;
  feeAmount: number;
  approvedExchangeAmount: number;
  pendingExchangeAmount: number;
  approvedBalance: number;
  withdrawableBalance: number;
};

export type DomainExchangeCreateContext = {
  defaultDomainId: string | null;
  currentBalance: number;
  hasConnectedDomain: boolean;
};

function formatStamp(value: Date | string | null) {
  return formatKoreanDateTime(value, { emptyValue: "" });
}

function toStatus(status: ExchangeRequestDbRow["status"]): DomainExchangeRow["status"] {
  if (status === "PENDING") {
    return "승인중";
  }

  return status === "REJECTED" || status === "CANCELED" ? "승인거절" : "승인";
}

function toExchangeRow(row: ExchangeRequestDbRow): DomainExchangeRow {
  const topDistributorName = row.top_distributor_name ?? "-";
  const distributorName = row.distributor_name ?? row.child_distributor_names ?? "-";

  return {
    id: row.id,
    branch: distributorName === "-" ? topDistributorName : distributorName,
    topDistributor: topDistributorName,
    distributor: distributorName,
    loginId: row.user_uid ?? "-",
    domain: row.domain_name ?? "-",
    bankName: row.bank_name ?? "-",
    accountHolder: row.account_holder ?? "-",
    accountNumber: row.account_number ?? "-",
    amount: Number(row.amount),
    requestedAt: formatStamp(row.requested_at),
    completedAt: formatStamp(row.processed_at),
    status: toStatus(row.status),
  };
}

export async function getDomainExchangeRows(
  fallbackRows: DomainExchangeRow[],
  user?: SessionUser,
) {
  if (!hasDatabaseUrl()) {
    return fallbackRows;
  }
  const scope = user
    ? await getScopedDataCondition(user, {
        company: "er",
        distributor: "dist",
        distributorAdmin: "dist_admin",
      })
    : { sql: "", values: [] as string[] };

  const result = await query<ExchangeRequestDbRow>(
    `
      select
        er.id::text,
        er.user_uid,
        case when parent_dist.id is null then null else dist.name end as distributor_name,
        child_dist.names as child_distributor_names,
        coalesce(parent_dist.name, dist.name) as top_distributor_name,
        dom.domain_name,
        er.bank_name,
        er.account_holder,
        er.account_number,
        er.amount::text,
        er.requested_at,
        er.processed_at,
        er.status::text as status
      from exchange_requests er
      left join domains dom on dom.id = er.domain_id
      left join distributors dist on dist.id = er.distributor_id
      left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
      left join lateral (
        select string_agg(child.name, ', ' order by child.name) as names
        from distributors child
        where child.parent_distributor_id = dist.id
          and child.status = 'ACTIVE'
      ) child_dist on parent_dist.id is null
      where 1 = 1
        ${scope.sql}
      order by er.requested_at desc
      limit ${DEFAULT_ROW_LIMIT}
    `,
    scope.values,
  );

  return result.rows.map(toExchangeRow);
}

export async function getDomainExchangeOptions(user: SessionUser) {
  if (!hasDatabaseUrl()) {
    return [] satisfies DomainExchangeOption[];
  }

  const result = await query<DomainExchangeOption>(
    `
      select
        dom.id::text,
        coalesce(nullif(dom.domain_name, ''), c.company_name) as name
      from domains dom
      join companies c on c.id = dom.company_id
      join distributors dist on dist.id = dom.distributor_id
      where dom.status <> 'DELETED'
        and dist.admin_id = $1::uuid
      order by coalesce(nullif(dom.domain_name, ''), c.company_name) asc
    `,
    [user.id],
  );

  return result.rows;
}

export async function getDomainExchangeCreateContext(user: SessionUser) {
  const result = await query<{
    distributor_id: string;
    current_balance: string;
    company_id: string;
    domain_id: string | null;
  }>(
    `
      select
        dist.id::text as distributor_id,
        dist.current_balance::text,
        dist.company_id::text,
        (
          select dom.id::text
          from domains dom
          where dom.distributor_id = dist.id
            and dom.status <> 'DELETED'
          order by dom.created_at desc
          limit 1
        ) as domain_id
      from distributors dist
      where dist.admin_id = $1::uuid
        and dist.status = 'ACTIVE'
      order by dist.created_at desc
      limit 1
    `,
    [user.id],
  );
  const scopeRow = result.rows[0];

  if (!scopeRow) {
    throw new Error("환전신청을 연결할 계정을 찾을 수 없습니다.");
  }

  return {
    defaultDomainId: scopeRow.domain_id,
    currentBalance: Number(scopeRow.current_balance),
    hasConnectedDomain: Boolean(scopeRow.domain_id),
  } satisfies DomainExchangeCreateContext;
}

async function findExchangeScope(domainId: string | null | undefined, user: SessionUser) {
  const distributorResult = await query<{
    distributor_id: string;
    current_balance: string;
    company_id: string;
  }>(
    `
      select
        dist.id::text as distributor_id,
        dist.current_balance::text,
        dist.company_id::text
      from distributors dist
      where dist.admin_id = $1::uuid
        and dist.status = 'ACTIVE'
      order by dist.created_at desc
      limit 1
    `,
    [user.id],
  );
  const distributorScope = distributorResult.rows[0];

  if (!distributorScope) {
    throw new Error("환전신청을 연결할 계정을 찾을 수 없습니다.");
  }

  if (!domainId) {
    const ownDomainResult = await query<{
      domain_id: string | null;
    }>(
      `
        select dom.id::text as domain_id
        from domains dom
        where dom.distributor_id = $1::uuid
          and dom.status <> 'DELETED'
        order by dom.created_at desc
        limit 1
      `,
      [distributorScope.distributor_id],
    );

    return {
      company_id: distributorScope.company_id,
      domain_id: ownDomainResult.rows[0]?.domain_id ?? null,
      distributor_id: distributorScope.distributor_id,
      current_balance: distributorScope.current_balance,
    };
  }

  const domainResult = await query<{
    company_id: string;
    domain_id: string | null;
    distributor_id: string | null;
    current_balance: string;
  }>(
    `
      select
        dom.company_id::text,
        dom.id::text as domain_id,
        dom.distributor_id::text,
        dom.current_balance::text
      from domains dom
      join distributors dist on dist.id = dom.distributor_id
      where dom.id = $1::uuid
        and dom.status <> 'DELETED'
        and dist.admin_id = $2::uuid
      order by dom.created_at desc
      limit 1
    `,
    [domainId, user.id],
  );
  const domainScope = domainResult.rows[0];

  if (!domainScope) {
    throw new Error("환전신청을 연결할 도메인을 찾을 수 없습니다.");
  }

  return domainScope;
}

async function findIntegrationExchangeScope(input: {
  domainId?: string | null;
  domainName?: string;
}) {
  const domainId = input.domainId?.trim();
  const domainName = input.domainName?.trim();

  if (!domainId && !domainName) {
    throw new Error("환전신청을 연결할 도메인 정보가 필요합니다.");
  }

  const result = await query<{
    company_id: string;
    domain_id: string;
    distributor_id: string | null;
    distributor_balance: string | null;
    domain_balance: string;
  }>(
    `
      select
        dom.company_id::text,
        dom.id::text as domain_id,
        dom.distributor_id::text,
        dist.current_balance::text as distributor_balance,
        dom.current_balance::text as domain_balance
      from domains dom
      join companies c on c.id = dom.company_id
      left join distributors dist on dist.id = dom.distributor_id
      where dom.status <> 'DELETED'
        and (dist.id is null or dist.status = 'ACTIVE')
        and (
          ($1::uuid is not null and dom.id = $1::uuid)
          or (
            $1::uuid is null
            and $2::text is not null
            and (
              dom.domain_name = $2
              or c.company_name = $2
            )
          )
        )
      order by dom.created_at desc
      limit 1
    `,
    [domainId ?? null, domainName ?? null],
  );
  const scope = result.rows[0];

  if (!scope) {
    throw new Error("환전신청을 연결할 도메인을 찾을 수 없습니다.");
  }

  return {
    company_id: scope.company_id,
    domain_id: scope.domain_id,
    distributor_id: scope.distributor_id,
    current_balance: scope.domain_balance,
  };
}

async function getDomainExchangeBalance(
  executor: QueryExecutor,
  domainId: string,
): Promise<DomainExchangeBalance> {
  const result = await executor.query<{
    charge_amount: string;
    fee_amount: string;
    approved_exchange_amount: string;
    pending_exchange_amount: string;
  }>(
    `
      select
        coalesce(sum(source.charge_amount), 0)::text as charge_amount,
        coalesce(sum(source.fee_amount), 0)::text as fee_amount,
        coalesce(sum(source.approved_exchange_amount), 0)::text as approved_exchange_amount,
        coalesce(sum(source.pending_exchange_amount), 0)::text as pending_exchange_amount
      from (
        select
          cr.amount as charge_amount,
          coalesce(comm.saved_commission, 0) as fee_amount,
          0::numeric as approved_exchange_amount,
          0::numeric as pending_exchange_amount
        from charge_requests cr
        left join commission_records comm on comm.charge_request_id = cr.id
        where cr.domain_id = $1::uuid
          and cr.status in ('APPROVED', 'COMPLETED')

        union all

        select
          0::numeric as charge_amount,
          0::numeric as fee_amount,
          er.amount as approved_exchange_amount,
          0::numeric as pending_exchange_amount
        from exchange_requests er
        where er.domain_id = $1::uuid
          and er.status in ('APPROVED', 'COMPLETED')

        union all

        select
          0::numeric as charge_amount,
          0::numeric as fee_amount,
          0::numeric as approved_exchange_amount,
          er.amount as pending_exchange_amount
        from exchange_requests er
        where er.domain_id = $1::uuid
          and er.status = 'PENDING'
      ) source
    `,
    [domainId],
  );
  const row = result.rows[0];
  const chargeAmount = Number(row?.charge_amount ?? 0);
  const feeAmount = Number(row?.fee_amount ?? 0);
  const approvedExchangeAmount = Number(row?.approved_exchange_amount ?? 0);
  const pendingExchangeAmount = Number(row?.pending_exchange_amount ?? 0);
  const approvedBalance = chargeAmount - feeAmount - approvedExchangeAmount;

  return {
    chargeAmount,
    feeAmount,
    approvedExchangeAmount,
    pendingExchangeAmount,
    approvedBalance,
    withdrawableBalance: approvedBalance - pendingExchangeAmount,
  };
}

async function getApprovedDomainBalanceForUpdate(
  client: PoolClient,
  domainId: string,
) {
  const domainResult = await client.query<{ id: string }>(
    `
      select id::text
      from domains
      where id = $1::uuid
        and status <> 'DELETED'
      for update
    `,
    [domainId],
  );

  if (!domainResult.rows[0]) {
    throw new Error("환전 요청의 도메인 정보를 찾을 수 없습니다.");
  }

  const balance = await getDomainExchangeBalance(client, domainId);

  return balance.approvedBalance.toString();
}

async function insertExchangeRequest(
  input: CreateDomainExchangeInput & {
    companyId: string;
    domainId: string | null;
    distributorId: string | null;
  },
) {
  const result = await query<{ id: string }>(
    `
      insert into exchange_requests (
        external_id,
        company_id,
        domain_id,
        distributor_id,
        user_uid,
        bank_name,
        account_holder,
        account_number,
        amount,
        status,
        requested_at,
        raw_payload
      )
      values (
        $1,
        $2::uuid,
        $3::uuid,
        $4::uuid,
        $5,
        $6,
        $7,
        $8,
        $9,
        'PENDING',
        now(),
        $10::jsonb
      )
      returning id::text
    `,
    [
      input.externalId ?? null,
      input.companyId,
      input.domainId,
      input.distributorId,
      input.userId,
      input.bankName ?? null,
      input.accountHolder ?? null,
      input.accountNumber ?? null,
      input.amount,
      JSON.stringify(input.rawPayload ?? input),
    ],
  );

  return result.rows[0]?.id;
}

export async function createDomainExchange(
  input: CreateDomainExchangeInput & { user: SessionUser },
) {
  const scope = await findExchangeScope(input.domainId, input.user);

  if (input.amount > Number(scope.current_balance)) {
    throw new Error("보유금보다 큰 금액은 신청할 수 없습니다.");
  }

  return insertExchangeRequest({
    ...input,
    companyId: scope.company_id,
    domainId: scope.domain_id,
    distributorId: scope.distributor_id,
  });
}

export async function createIntegrationDomainExchange(input: CreateDomainExchangeInput) {
  if (!hasDatabaseUrl()) {
    throw new Error("DB 연결 환경에서만 연동 API를 사용할 수 있습니다.");
  }

  const scope = await findIntegrationExchangeScope(input);
  const balance = await getDomainExchangeBalance({ query }, scope.domain_id);

  if (input.amount > balance.withdrawableBalance) {
    throw new Error("보유금보다 큰 금액은 신청할 수 없습니다.");
  }

  return insertExchangeRequest({
    ...input,
    companyId: scope.company_id,
    domainId: scope.domain_id,
    distributorId: scope.distributor_id,
  });
}

export async function approveDomainExchange(id: string, processedBy: string) {
  await withTransaction(async (client) => {
    const exchangeResult = await client.query<{
      id: string;
      domain_id: string | null;
      distributor_id: string | null;
      amount: string;
    }>(
      `
        select
          er.id::text,
          er.domain_id::text,
          er.distributor_id::text,
          er.amount::text
        from exchange_requests er
        where er.id = $1::uuid
          and er.status = 'PENDING'
        for update of er
      `,
      [id],
    );
    const exchange = exchangeResult.rows[0];

    if (!exchange) {
      throw new Error("처리할 대기 환전 요청을 찾을 수 없습니다.");
    }

    const requestAmount = Number(exchange.amount);
    const domainBalance = exchange.domain_id
      ? await getApprovedDomainBalanceForUpdate(client, exchange.domain_id)
      : null;
    const distributorBalance =
      !domainBalance && exchange.distributor_id
        ? (
            await client.query<{ current_balance: string }>(
              `
                select current_balance::text
                from distributors
                where id = $1::uuid
                for update
              `,
              [exchange.distributor_id],
            )
          ).rows[0]?.current_balance
        : null;
    const hasDistributorBalance =
      Boolean(exchange.distributor_id) && distributorBalance !== null && distributorBalance !== undefined;
    const beforeBalance = Number(
      hasDistributorBalance ? distributorBalance : domainBalance ?? 0,
    );
    const afterBalance = beforeBalance - requestAmount;

    if (afterBalance < 0) {
      throw new Error("보유금보다 큰 환전 요청은 승인할 수 없습니다.");
    }

    if (hasDistributorBalance) {
      await client.query(
        `
          update distributors
          set current_balance = $2,
              updated_at = now()
          where id = $1::uuid
        `,
        [exchange.distributor_id, afterBalance],
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
            'DOMAIN_EXCHANGE',
            $5::uuid,
            '도메인 환전 승인',
            $6::uuid
          )
          on conflict (source_type, source_id) do nothing
        `,
        [
          exchange.distributor_id,
          -requestAmount,
          beforeBalance,
          afterBalance,
          id,
          processedBy,
        ],
      );
    } else if (exchange.domain_id) {
      await client.query(
        `
          update domains
          set current_balance = $2,
              updated_at = now()
          where id = $1::uuid
        `,
        [exchange.domain_id, afterBalance],
      );

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
          values ($1::uuid, 'domain_exchange_approved', 'domain', $2::uuid, $3::jsonb, $4::jsonb)
        `,
        [
          processedBy,
          exchange.domain_id,
          JSON.stringify({ balance: beforeBalance }),
          JSON.stringify({ balance: afterBalance, amount: -requestAmount }),
        ],
      );
    }

    await client.query(
      `
        update exchange_requests
        set status = 'APPROVED',
            processed_at = coalesce(processed_at, now()),
            processed_by = $2::uuid,
            updated_at = now()
        where id = $1::uuid
          and status = 'PENDING'
      `,
      [id, processedBy],
    );
  });
}

export async function rejectDomainExchange(id: string, processedBy: string) {
  const result = await query<{ id: string }>(
    `
      update exchange_requests
      set status = 'REJECTED',
          processed_at = coalesce(processed_at, now()),
          processed_by = $2::uuid,
          updated_at = now()
      where id = $1::uuid and status = 'PENDING'
      returning id::text
    `,
    [id, processedBy],
  );

  if (!result.rows[0]) {
    throw new Error("처리할 대기 환전 요청을 찾을 수 없습니다.");
  }
}

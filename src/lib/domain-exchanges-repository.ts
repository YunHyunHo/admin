import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";
import { formatKoreanDateTime } from "@/lib/korean-time";
import { getScopedDistributorCondition } from "@/lib/master-scope";
import type { SessionUser } from "@/lib/auth";
import type {
  DomainExchangeOption,
  DomainExchangeRow,
} from "@/lib/domain-exchanges-types";

const DEFAULT_ROW_LIMIT = 200;

type ExchangeRequestDbRow = {
  id: string;
  distributor_name: string | null;
  child_distributor_names: string | null;
  distributor_login_id: string | null;
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
    loginId: row.distributor_login_id ?? "-",
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
    ? user.role === "MASTER"
      ? { sql: "", values: [] as string[] }
      : getScopedDistributorCondition(user)
    : { sql: "", values: [] as string[] };

  const result = await query<ExchangeRequestDbRow>(
    `
      select
        er.id::text,
        case when parent_dist.id is null then null else dist.name end as distributor_name,
        child_dist.names as child_distributor_names,
        dist_admin.login_id as distributor_login_id,
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
        dist.current_balance::text
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

export async function createDomainExchange(
  input: CreateDomainExchangeInput & { user: SessionUser },
) {
  const scope = await findExchangeScope(input.domainId, input.user);

  if (input.amount > Number(scope.current_balance)) {
    throw new Error("보유 수수료보다 큰 금액은 신청할 수 없습니다.");
  }

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
      scope.company_id,
      scope.domain_id,
      scope.distributor_id,
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

export async function approveDomainExchange(id: string, processedBy: string) {
  await withTransaction(async (client) => {
    const exchangeResult = await client.query<{
      id: string;
      domain_id: string | null;
      distributor_id: string | null;
      amount: string;
      distributor_balance: string | null;
      domain_balance: string | null;
    }>(
      `
        select
          er.id::text,
          er.domain_id::text,
          er.distributor_id::text,
          er.amount::text,
          dist.current_balance::text as distributor_balance,
          dom.current_balance::text as domain_balance
        from exchange_requests er
        left join distributors dist on dist.id = er.distributor_id
        left join domains dom on dom.id = er.domain_id
        where er.id = $1::uuid
          and er.status = 'PENDING'
        for update of er, dist, dom
      `,
      [id],
    );
    const exchange = exchangeResult.rows[0];

    if (!exchange) {
      throw new Error("처리할 대기 환전 요청을 찾을 수 없습니다.");
    }

    const requestAmount = Number(exchange.amount);
    const hasDistributorBalance =
      Boolean(exchange.distributor_id) && exchange.distributor_balance !== null;
    const beforeBalance = Number(
      hasDistributorBalance
        ? exchange.distributor_balance
        : exchange.domain_balance ?? 0,
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

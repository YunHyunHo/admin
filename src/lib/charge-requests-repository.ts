import { NextResponse } from "next/server";

import {
  formatKoreanWon,
  type PendingRequest,
  type ProcessedRequest,
} from "@/lib/charge-utils";
import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";
import { ensureFeeRateSchema } from "@/lib/fee-rate-schema";
import { formatKoreanDateTime } from "@/lib/korean-time";
import { getScopedDistributorCondition } from "@/lib/master-scope";
import {
  getDefaultChargeRequestState,
  getChargeRequestsByCompany,
  processChargeRequest,
  type ChargeRequestState,
} from "@/lib/mock-api-store";
import {
  getMockChargeStateFromCookie,
  setMockChargeStateCookie,
} from "@/lib/mock-state-cookie";
import type { QueryResultRow } from "pg";
import type { SessionUser } from "@/lib/auth";

const DEFAULT_ROW_LIMIT = 300;

type ScopedClause = {
  sql: string;
  values: unknown[];
};

type ChargeRequestRow = {
  id: string;
  user_uid: string;
  bank_name: string | null;
  account_number: string | null;
  depositor: string | null;
  amount: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELED";
  requested_at: Date | string;
  processed_at: Date | string | null;
  company_name: string;
  domain_name: string | null;
  top_distributor_name: string | null;
  distributor_name: string | null;
  child_distributor_names: string | null;
};

type ChargeRequestAccountRow = {
  bank_name: string | null;
  account_number: string | null;
};

type CreateChargeRequestInput = {
  externalId?: string;
  userId: string;
  amount: number;
  depositor?: string;
  bankName?: string;
  accountNumber?: string;
  domainId?: string | null;
  domainName?: string;
  distributorId?: string | null;
  rawPayload?: unknown;
};

type QueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
};

type DomainChargeBalance = {
  approvedBalance: number;
  withdrawableBalance: number;
};

export type IntegrationChargeDomainOption = {
  id: string;
  name: string;
  distributorName: string;
};

export type IntegrationChargeDistributorOption = {
  id: string;
  name: string;
};

export type ChargeRequestsResponse = {
  pending: PendingRequest[];
  approved: ProcessedRequest[];
  rejected: ProcessedRequest[];
};

function formatStamp(value: Date | string | null) {
  return formatKoreanDateTime(value);
}

async function getDomainChargeBalance(
  executor: QueryExecutor,
  domainId: string,
): Promise<DomainChargeBalance> {
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
    approvedBalance,
    withdrawableBalance: approvedBalance - pendingExchangeAmount,
  };
}

function toPendingRequest(row: ChargeRequestRow): PendingRequest {
  const topDistributorName = row.top_distributor_name ?? "-";
  const distributorName = row.distributor_name ?? row.child_distributor_names ?? "-";
  const branchName = distributorName === "-" ? topDistributorName : distributorName;

  return {
    id: row.id,
    branch: branchName,
    userId: row.user_uid,
    topAgent: topDistributorName,
    subAgent: distributorName,
    domain: row.domain_name ?? "-",
    bankName: row.bank_name ?? "-",
    accountNumber: row.account_number ?? "-",
    depositor: row.depositor ?? "-",
    amount: formatKoreanWon(Number(row.amount)),
    requestedAt: formatStamp(row.requested_at),
  };
}

function toProcessedRequest(row: ChargeRequestRow): ProcessedRequest {
  return {
    ...toPendingRequest(row),
    completedAt: formatStamp(row.processed_at),
    status: row.status === "APPROVED" ? "승인" : "승인거절",
  };
}

function sortByProcessedAtDesc(left: ChargeRequestRow, right: ChargeRequestRow) {
  const leftTime = new Date(left.processed_at ?? left.requested_at).getTime();
  const rightTime = new Date(right.processed_at ?? right.requested_at).getTime();

  return rightTime - leftTime;
}

function splitRows(rows: ChargeRequestRow[]): ChargeRequestsResponse {
  return {
    pending: rows
      .filter((row) => row.status === "PENDING")
      .sort(
        (left, right) =>
          new Date(left.requested_at).getTime() - new Date(right.requested_at).getTime(),
      )
      .map(toPendingRequest),
    approved: rows
      .filter((row) => row.status === "APPROVED" || row.status === "COMPLETED")
      .sort(sortByProcessedAtDesc)
      .map(toProcessedRequest),
    rejected: rows
      .filter((row) => row.status === "REJECTED" || row.status === "CANCELED")
      .sort(sortByProcessedAtDesc)
      .map(toProcessedRequest),
  };
}

function shiftSqlParams(sql: string, offset: number) {
  return sql.replace(/\$(\d+)/g, (_, indexText) => {
    const index = Number(indexText);
    return `$${index + offset}`;
  });
}

async function getManagedCompanyIds(userId: string) {
  const result = await query<{ company_id: string }>(
    `
      select acm.company_id::text as company_id
      from admin_company_mappings acm
      join companies c on c.id = acm.company_id
      where acm.admin_id = $1::uuid
        and c.status = 'ACTIVE'
      order by c.company_name asc
    `,
    [userId],
  );

  return result.rows.map((row) => row.company_id);
}

async function getChargeRequestScope(
  user: SessionUser,
  aliases: {
    charge?: string;
    distributor?: string;
    distributorAdmin?: string;
  } = {},
): Promise<ScopedClause> {
  if (user.role === "MASTER") {
    return {
      sql: "",
      values: [],
    };
  }

  if (user.role === "DOMAIN_ADMIN") {
    const companyIds = await getManagedCompanyIds(user.id);

    if (!companyIds.length) {
      return {
        sql: "and 1 = 0",
        values: [],
      };
    }

    return {
      sql: `and ${(aliases.charge ?? "cr")}.company_id = any($1::uuid[])`,
      values: [companyIds],
    };
  }

  const scope = getScopedDistributorCondition(
    user,
    aliases.distributor,
    aliases.distributorAdmin,
  );

  return { sql: scope.sql, values: scope.values };
}

async function getDbChargeRequests(user: SessionUser) {
  const scope = await getChargeRequestScope(user);
  const result = await query<ChargeRequestRow>(
    `
      select
        cr.id::text,
        cr.user_uid,
        coalesce(nullif(cr.bank_name, ''), charge_account.bank_name) as bank_name,
        coalesce(nullif(cr.account_number, ''), charge_account.account_number) as account_number,
        cr.depositor,
        cr.amount::text,
        cr.status::text as status,
        cr.requested_at,
        cr.processed_at,
        c.company_name,
        coalesce(nullif(d.domain_name, ''), c.company_name) as domain_name,
        coalesce(parent_dist.name, dist.name) as top_distributor_name,
        case when parent_dist.id is null then null else dist.name end as distributor_name,
        child_dist.names as child_distributor_names
      from charge_requests cr
      join companies c on c.id = cr.company_id
      left join domains d on d.id = cr.domain_id
      left join distributors dist on dist.id = cr.distributor_id
      left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
      left join lateral (
        select ba.bank_name, ba.account_number
        from bank_accounts ba
        where ba.is_active = true
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
      where 1 = 1
        ${scope.sql}
      order by cr.requested_at desc, cr.created_at desc
      limit ${DEFAULT_ROW_LIMIT}
    `,
    scope.values,
  );

  return splitRows(result.rows);
}

async function getLinkedChargeRequestAccount(input: {
  companyId: string;
  distributorId: string | null;
}) {
  const result = await query<ChargeRequestAccountRow>(
    `
      select ba.bank_name, ba.account_number
      from bank_accounts ba
      where ba.is_active = true
        and (
          (
            ba.company_id = $1::uuid
            and (
              ba.distributor_id = $2::uuid
              or ba.distributor_id is null
            )
          )
          or (
            $2::uuid is not null
            and ba.distributor_id = $2::uuid
            and ba.company_id is null
          )
        )
      order by
        case
          when ba.company_id = $1::uuid and ba.distributor_id = $2::uuid then 0
          when ba.company_id = $1::uuid and ba.distributor_id is null then 1
          when ba.distributor_id = $2::uuid then 2
          else 3
        end,
        ba.created_at desc
      limit 1
    `,
    [input.companyId, input.distributorId],
  );

  return result.rows[0] ?? null;
}

export async function getChargeRequestsForUser(user: SessionUser) {
  if (hasDatabaseUrl()) {
    return getDbChargeRequests(user);
  }

  const state = await getMockChargeStateFromCookie();
  const companyRequests = getChargeRequestsByCompany(user.companyName, state);

  if (
    user.role === "MASTER" &&
    !companyRequests.pending.length &&
    !companyRequests.approved.length &&
    !companyRequests.rejected.length
  ) {
    return state;
  }

  return companyRequests;
}

async function ensureDbScope(input: { domainId?: string | null; domainName?: string; user: SessionUser }) {
  const scope = await getChargeRequestScope(input.user, {
    charge: "dom",
    distributor: "dist",
    distributorAdmin: "dist_admin",
  });
  const domainValue = input.domainId ?? input.domainName;
  const domainPredicate = input.domainId
    ? "dom.id = $2::uuid"
    : "(dom.domain_name = $2 or c.company_name = $2)";

  if (!domainValue) {
    return getManualChargeScope(input.user);
  }

  const existingDomain = await query<{
    company_id: string;
    domain_id: string | null;
    distributor_id: string | null;
  }>(
    `
      select
        dom.company_id::text,
        dom.id::text as domain_id,
        dom.distributor_id::text
      from domains dom
      join companies c on c.id = dom.company_id
      join distributors dist on dist.id = dom.distributor_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
      where ${domainPredicate} and dom.status <> 'DELETED'
        ${scope.sql}
      order by dom.created_at desc
      limit 1
    `,
    [...scope.values, domainValue],
  );
  const domain = existingDomain.rows[0];

  if (!domain) {
    throw new Error("충전신청을 연결할 도메인을 찾을 수 없습니다.");
  }

  return {
    companyId: domain.company_id,
    domainId: domain.domain_id,
    distributorId: domain.distributor_id,
  };
}

async function getManualChargeScope(user: SessionUser) {
  if (user.role === "DOMAIN_ADMIN") {
    const companyIds = await getManagedCompanyIds(user.id);

    if (!companyIds.length) {
      throw new Error("수동 충전신청을 연결할 업체를 먼저 설정해주세요.");
    }

    return {
      companyId: companyIds[0],
      domainId: null,
      distributorId: null,
    };
  }

  if (user.role === "MASTER") {
    const result = await query<{
      company_id: string;
      distributor_id: string | null;
    }>(
      `
        select
          c.id::text as company_id,
          dist.id::text as distributor_id
        from companies c
        left join distributors dist on dist.company_id = c.id
          and dist.status = 'ACTIVE'
        where c.status = 'ACTIVE'
        order by dist.created_at desc nulls last, c.created_at desc
        limit 1
      `,
    );
    const scope = result.rows[0];

    if (!scope) {
      throw new Error("수동 충전신청을 연결할 활성 업체를 찾지 못했습니다.");
    }

    return {
      companyId: scope.company_id,
      domainId: null,
      distributorId: scope.distributor_id,
    };
  }

  const result = await query<{
    company_id: string;
    distributor_id: string;
  }>(
    `
      select
        dist.company_id::text,
        dist.id::text as distributor_id
      from distributors dist
      where dist.admin_id = $1::uuid
        and dist.status = 'ACTIVE'
      order by dist.created_at desc
      limit 1
    `,
    [user.id],
  );
  const scope = result.rows[0];

  if (!scope) {
    throw new Error("수동 충전신청을 연결할 총판 정보를 찾지 못했습니다.");
  }

  return {
    companyId: scope.company_id,
    domainId: null,
    distributorId: scope.distributor_id,
  };
}

async function ensureIntegrationDbScope(input: {
  domainId?: string | null;
  domainName?: string;
  distributorId?: string | null;
}) {
  const domainValue = input.domainId ?? input.domainName;
  const domainPredicate = input.domainId
    ? "dom.id = $1::uuid"
    : "(dom.domain_name = $1 or c.company_name = $1)";

  if (!domainValue && input.distributorId) {
    const distributorResult = await query<{
      company_id: string;
      distributor_id: string;
    }>(
      `
        select
          dist.company_id::text,
          dist.id::text as distributor_id
        from distributors dist
        where dist.id = $1::uuid
          and dist.status = 'ACTIVE'
        limit 1
      `,
      [input.distributorId],
    );
    const distributor = distributorResult.rows[0];

    if (!distributor) {
      throw new Error("연동 가능한 하부계정을 찾을 수 없습니다.");
    }

    return {
      companyId: distributor.company_id,
      domainId: null,
      distributorId: distributor.distributor_id,
    };
  }

  if (!domainValue) {
    throw new Error("연동 도메인 또는 하부계정을 선택해주세요.");
  }

  const existingDomain = await query<{
    company_id: string;
    domain_id: string | null;
    distributor_id: string | null;
  }>(
    `
      select
        dom.company_id::text,
        dom.id::text as domain_id,
        dom.distributor_id::text
      from domains dom
      join companies c on c.id = dom.company_id
      join distributors dist on dist.id = dom.distributor_id
      where ${domainPredicate}
        and dom.status = 'ACTIVE'
        and dist.status = 'ACTIVE'
      order by dom.created_at desc
      limit 1
    `,
    [domainValue],
  );
  const domain = existingDomain.rows[0];

  if (!domain) {
    throw new Error("연동 가능한 도메인을 찾을 수 없습니다.");
  }

  return {
    companyId: domain.company_id,
    domainId: domain.domain_id,
    distributorId: domain.distributor_id,
  };
}

async function insertChargeRequest(input: CreateChargeRequestInput & {
  companyId: string;
  domainId: string | null;
  distributorId: string | null;
}) {
  const inputBankName = input.bankName?.trim() || null;
  const inputAccountNumber = input.accountNumber?.trim() || null;
  const linkedAccount =
    inputBankName && inputAccountNumber
      ? null
      : await getLinkedChargeRequestAccount({
          companyId: input.companyId,
          distributorId: input.distributorId,
        });
  const bankName = inputBankName ?? linkedAccount?.bank_name ?? null;
  const accountNumber = inputAccountNumber ?? linkedAccount?.account_number ?? null;

  const result = await query<{ id: string }>(
    `
      insert into charge_requests (
        external_id,
        company_id,
        domain_id,
        distributor_id,
        user_uid,
        bank_name,
        account_number,
        depositor,
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
      bankName,
      accountNumber,
      input.depositor ?? null,
      input.amount,
      JSON.stringify(input.rawPayload ?? input),
    ],
  );

  return result.rows[0]?.id;
}

export async function createDbChargeRequest(input: CreateChargeRequestInput & { user: SessionUser }) {
  const { companyId, domainId, distributorId } = await ensureDbScope({
    domainId: input.domainId,
    domainName: input.domainName,
    user: input.user,
  });

  return insertChargeRequest({
    ...input,
    companyId,
    domainId,
    distributorId,
  });
}

export async function createIntegrationChargeRequest(input: CreateChargeRequestInput) {
  const { companyId, domainId, distributorId } = await ensureIntegrationDbScope({
    domainId: input.domainId,
    domainName: input.domainName,
    distributorId: input.distributorId,
  });

  return insertChargeRequest({
    ...input,
    companyId,
    domainId,
    distributorId,
  });
}

export async function getIntegrationChargeDomainOptions() {
  if (!hasDatabaseUrl()) {
    return [] satisfies IntegrationChargeDomainOption[];
  }

  const result = await query<IntegrationChargeDomainOption>(
    `
      select
        dom.id::text as id,
        coalesce(nullif(dom.domain_name, ''), c.company_name) as name,
        dist.name as "distributorName"
      from domains dom
      join companies c on c.id = dom.company_id
      join distributors dist on dist.id = dom.distributor_id
      where dom.status = 'ACTIVE'
        and dist.status = 'ACTIVE'
      order by dom.created_at desc
      limit ${DEFAULT_ROW_LIMIT}
    `,
  );

  return result.rows;
}

export async function getIntegrationChargeDistributorOptions() {
  if (!hasDatabaseUrl()) {
    return [] satisfies IntegrationChargeDistributorOption[];
  }

  const result = await query<IntegrationChargeDistributorOption>(
    `
      select dist.id::text as id, dist.name
      from distributors dist
      where dist.status = 'ACTIVE'
      order by dist.created_at desc
      limit ${DEFAULT_ROW_LIMIT}
    `,
  );

  return result.rows;
}

export async function processDbChargeRequest(input: {
  id: string;
  status: ProcessedRequest["status"];
  processedBy: string;
  user: SessionUser;
}) {
  const nextStatus = input.status === "승인" ? "APPROVED" : "REJECTED";
  const result = await withTransaction(async (client) => {
    const scope = await getChargeRequestScope(input.user);
    const scopedSql = shiftSqlParams(scope.sql, 1);
    const accessCheck = await client.query<{ id: string }>(
      `
        select cr.id::text
        from charge_requests cr
        left join distributors dist on dist.id = cr.distributor_id
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where cr.id = $1::uuid
          ${scopedSql}
        limit 1
      `,
      [input.id, ...scope.values],
    );

    if (!accessCheck.rows.length) {
      return null;
    }

    const updateResult = await client.query<
      ChargeRequestRow & {
        company_id: string;
        domain_id: string | null;
        distributor_id: string | null;
      }
    >(
      `
        update charge_requests
        set
          status = $2::request_status,
          processed_at = now(),
          processed_by = $3::uuid,
          updated_at = now()
        where id = $1::uuid and status = 'PENDING'
        returning
          id::text,
          company_id::text,
          domain_id::text,
          distributor_id::text,
          user_uid,
          bank_name,
          account_number,
          depositor,
          amount::text,
          status::text as status,
          requested_at,
          processed_at,
          (select company_name from companies where id = charge_requests.company_id) as company_name,
          (select domain_name from domains where id = charge_requests.domain_id) as domain_name,
          (
            select coalesce(parent_dist.name, dist.name)
            from distributors dist
            left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
            where dist.id = charge_requests.distributor_id
          ) as top_distributor_name,
          (
            select case when parent_dist.id is null then null else dist.name end
            from distributors dist
            left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
            where dist.id = charge_requests.distributor_id
          ) as distributor_name,
          (
            select string_agg(child.name, ', ' order by child.name)
            from distributors dist
            join distributors child on child.parent_distributor_id = dist.id
            left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
            where dist.id = charge_requests.distributor_id
              and parent_dist.id is null
              and child.status = 'ACTIVE'
          ) as child_distributor_names
      `,
      [input.id, nextStatus, input.processedBy],
    );
    const updated = updateResult.rows[0];

    if (!updated && nextStatus === "REJECTED") {
      const approvedResult = await client.query<
        ChargeRequestRow & {
          company_id: string;
          domain_id: string | null;
          distributor_id: string | null;
        }
      >(
        `
          select
            cr.id::text,
            cr.company_id::text,
            cr.domain_id::text,
            cr.distributor_id::text,
            cr.user_uid,
            cr.bank_name,
            cr.account_number,
            cr.depositor,
            cr.amount::text,
            cr.status::text as status,
            cr.requested_at,
            cr.processed_at,
            c.company_name,
            d.domain_name,
            coalesce(parent_dist.name, dist.name) as top_distributor_name,
            case when parent_dist.id is null then null else dist.name end as distributor_name,
            (
              select string_agg(child.name, ', ' order by child.name)
              from distributors base_dist
              join distributors child on child.parent_distributor_id = base_dist.id
              left join distributors base_parent on base_parent.id = base_dist.parent_distributor_id
              where base_dist.id = cr.distributor_id
                and base_parent.id is null
                and child.status = 'ACTIVE'
            ) as child_distributor_names
          from charge_requests cr
          join companies c on c.id = cr.company_id
          left join domains d on d.id = cr.domain_id
          left join distributors dist on dist.id = cr.distributor_id
          left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
          left join admins dist_admin on dist_admin.id = dist.admin_id
          where cr.id = $1::uuid
            and cr.status in ('APPROVED', 'COMPLETED')
            ${scopedSql}
          for update of cr
          limit 1
        `,
        [input.id, ...scope.values],
      );
      const approved = approvedResult.rows[0];

      if (!approved) {
        return updateResult;
      }

      const commissionResult = await client.query<{
        distributor_id: string | null;
        saved_commission: string;
      }>(
        `
          select distributor_id::text, saved_commission::text
          from commission_records
          where charge_request_id = $1::uuid
            and status in ('APPROVED', 'COMPLETED')
          for update
          limit 1
        `,
        [approved.id],
      );
      const commission = commissionResult.rows[0];
      const distributorId = commission?.distributor_id ?? approved.distributor_id;
      const savedCommission = Number(commission?.saved_commission ?? 0);
      const netChargeAmount = Number(approved.amount) - savedCommission;

      if (approved.domain_id && netChargeAmount > 0) {
        await client.query(
          `
            select id
            from domains
            where id = $1::uuid
              and status <> 'DELETED'
            for update
          `,
          [approved.domain_id],
        );
        const domainBalance = await getDomainChargeBalance(client, approved.domain_id);
        const afterWithdrawableBalance =
          domainBalance.withdrawableBalance - netChargeAmount;
        const afterBalance = domainBalance.approvedBalance - netChargeAmount;

        if (afterWithdrawableBalance < 0) {
          throw new Error("도메인 보유금이 부족해 승인건을 거절할 수 없습니다.");
        }

        await client.query(
          `
            update domains
            set current_balance = $2, updated_at = now()
            where id = $1::uuid
          `,
          [approved.domain_id, afterBalance],
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
            values ($1::uuid, 'charge_request_rejected_after_approval', 'domain', $2::uuid, $3::jsonb, $4::jsonb)
          `,
          [
            input.processedBy,
            approved.domain_id,
            JSON.stringify({ balance: domainBalance.approvedBalance }),
            JSON.stringify({
              balance: afterBalance,
              amount: -netChargeAmount,
              chargeRequestId: approved.id,
            }),
          ],
        );
      }

      if (distributorId && savedCommission > 0) {
        const balanceResult = await client.query<{
          current_balance: string;
        }>(
          `
            select current_balance::text
            from distributors
            where id = $1::uuid
            for update
          `,
          [distributorId],
        );
        const beforeBalance = Number(balanceResult.rows[0]?.current_balance ?? 0);
        const afterBalance = beforeBalance - savedCommission;

        if (afterBalance < 0) {
          throw new Error("총판 보유금이 부족해 승인건을 거절할 수 없습니다.");
        }

        await client.query(
          `
            update distributors
            set current_balance = $2, updated_at = now()
            where id = $1::uuid
          `,
          [distributorId, afterBalance],
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
            values ($1::uuid, $2, $3, $4, 'COMMISSION_REVERSAL', $5::uuid, '충전 승인거절 수수료 차감', $6::uuid)
            on conflict (source_type, source_id) do nothing
          `,
          [
            distributorId,
            -savedCommission,
            beforeBalance,
            afterBalance,
            approved.id,
            input.processedBy,
          ],
        );
      }

      await client.query(
        `
          update commission_records
          set status = 'REJECTED'
          where charge_request_id = $1::uuid
            and status in ('APPROVED', 'COMPLETED')
        `,
        [approved.id],
      );

      const reversedResult = await client.query<
        ChargeRequestRow & {
          company_id: string;
          domain_id: string | null;
          distributor_id: string | null;
        }
      >(
        `
          update charge_requests
          set
            status = 'REJECTED',
            processed_at = now(),
            processed_by = $2::uuid,
            updated_at = now()
          where id = $1::uuid
          returning
            id::text,
            company_id::text,
            domain_id::text,
            distributor_id::text,
            user_uid,
            bank_name,
            account_number,
            depositor,
            amount::text,
            status::text as status,
            requested_at,
            processed_at,
            (select company_name from companies where id = charge_requests.company_id) as company_name,
            (select domain_name from domains where id = charge_requests.domain_id) as domain_name,
            (
              select coalesce(parent_dist.name, dist.name)
              from distributors dist
              left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
              where dist.id = charge_requests.distributor_id
            ) as top_distributor_name,
            (
              select case when parent_dist.id is null then null else dist.name end
              from distributors dist
              left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
              where dist.id = charge_requests.distributor_id
            ) as distributor_name,
            (
              select string_agg(child.name, ', ' order by child.name)
              from distributors dist
              join distributors child on child.parent_distributor_id = dist.id
              left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
              where dist.id = charge_requests.distributor_id
                and parent_dist.id is null
                and child.status = 'ACTIVE'
            ) as child_distributor_names
        `,
        [approved.id, input.processedBy],
      );

      return reversedResult;
    }

    if (!updated || nextStatus !== "APPROVED") {
      return updateResult;
    }

    await ensureFeeRateSchema(client);

    const feeRateResult = await client.query<{
      company_rate: string;
      distributor_rate: string;
      agency_rate: string;
      sub_distributor_rate: string;
    }>(
      `
        select
          company_rate::text,
          distributor_rate::text,
          agency_rate::text,
          coalesce(sub_distributor_rate, 0)::text as sub_distributor_rate
        from fee_rates
        where
          starts_at <= now()
          and (ends_at is null or ends_at > now())
          and domain_id = $1::uuid
        order by starts_at desc, created_at desc
        limit 1
      `,
      [updated.domain_id],
    );
    const feeRates = feeRateResult.rows[0];
    let distributorId = updated.distributor_id;

    if (!distributorId) {
      const fallbackDistributor = await client.query<{ id: string }>(
        `
          select id::text
          from distributors
          where status = 'ACTIVE'
          order by created_at asc
          limit 1
        `,
      );

      distributorId = fallbackDistributor.rows[0]?.id ?? null;
    }

    const amount = Number(updated.amount);
    const hasSubDistributor =
      Boolean(updated.top_distributor_name) &&
      Boolean(updated.distributor_name ?? updated.child_distributor_names);
    const companyRate = Number(feeRates?.company_rate ?? "0.2");
    const distributorRate = Number(feeRates?.distributor_rate ?? "0.1");
    const agencyRate = Number(
      feeRates?.agency_rate ?? (hasSubDistributor ? "0.1" : "0"),
    );
    const subDistributorRate = Number(feeRates?.sub_distributor_rate ?? "0");
    const totalRate =
      companyRate + distributorRate + agencyRate + subDistributorRate;
    const companyFee = Math.floor(amount * (companyRate / 100));
    const distributorFee = Math.floor(amount * (distributorRate / 100));
    const savedCommission = Math.floor(amount * (totalRate / 100));
    const netChargeAmount = amount - savedCommission;

    await client.query(
      `
        insert into commission_records (
          charge_request_id,
          company_id,
          domain_id,
          distributor_id,
          charge_amount,
          commission_rate,
          company_fee,
          distributor_fee,
          saved_commission,
          status
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6,
          $7,
          $8,
          $9,
          'APPROVED'
        )
        on conflict (charge_request_id) do nothing
      `,
      [
        updated.id,
        updated.company_id,
        updated.domain_id,
        distributorId,
        amount,
        totalRate,
        companyFee,
        distributorFee,
        savedCommission,
      ],
    );

    if (updated.domain_id && netChargeAmount > 0) {
      const domainBalanceResult = await client.query<{
        current_balance: string;
      }>(
        `
          select current_balance::text
          from domains
          where id = $1::uuid
          for update
        `,
        [updated.domain_id],
      );
      const beforeBalance = Number(
        domainBalanceResult.rows[0]?.current_balance ?? 0,
      );
      const afterBalance = beforeBalance + netChargeAmount;

      await client.query(
        `
          update domains
          set current_balance = $2, updated_at = now()
          where id = $1::uuid
        `,
        [updated.domain_id, afterBalance],
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
          values ($1::uuid, 'charge_request_approved', 'domain', $2::uuid, $3::jsonb, $4::jsonb)
        `,
        [
          input.processedBy,
          updated.domain_id,
          JSON.stringify({ balance: beforeBalance }),
          JSON.stringify({
            balance: afterBalance,
            amount: netChargeAmount,
            chargeRequestId: updated.id,
          }),
        ],
      );
    }

    if (distributorId && savedCommission > 0) {
      const balanceResult = await client.query<{
        current_balance: string;
      }>(
        `
          select current_balance::text
          from distributors
          where id = $1::uuid
          for update
        `,
        [distributorId],
      );
      const beforeBalance = Number(balanceResult.rows[0]?.current_balance ?? 0);
      const afterBalance = beforeBalance + savedCommission;

      await client.query(
        `
          update distributors
          set current_balance = $2, updated_at = now()
          where id = $1::uuid
        `,
        [distributorId, afterBalance],
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
          values ($1::uuid, $2, $3, $4, 'COMMISSION', $5::uuid, '충전 승인 수수료 적립', $6::uuid)
          on conflict (source_type, source_id) do nothing
        `,
        [
          distributorId,
          savedCommission,
          beforeBalance,
          afterBalance,
          updated.id,
          input.processedBy,
        ],
      );
    }

    return updateResult;
  });

  const row = result?.rows[0];

  return row ? toProcessedRequest(row) : null;
}

export async function resetChargeRequestsForUser(user: SessionUser) {
  if (hasDatabaseUrl()) {
    return getDbChargeRequests(user);
  }

  const state = getDefaultChargeRequestState();
  const response = NextResponse.json(getChargeRequestsByCompany(user.companyName, state));

  setMockChargeStateCookie(response, state);

  return response;
}

export async function processMockChargeRequest(input: {
  user: SessionUser;
  id: string;
  status: ProcessedRequest["status"];
  state: ChargeRequestState;
}) {
  return processChargeRequest(
    input.user.companyName,
    input.id,
    input.status,
    input.state,
  );
}

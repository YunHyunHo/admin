import { NextResponse } from "next/server";

import {
  formatKoreanWon,
  type PendingRequest,
  type ProcessedRequest,
} from "@/lib/charge-utils";
import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";
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

function toPendingRequest(row: ChargeRequestRow): PendingRequest {
  const topDistributorName = row.top_distributor_name ?? "-";
  const distributorName = row.distributor_name ?? "-";
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
      .map(toProcessedRequest),
    rejected: rows
      .filter((row) => row.status === "REJECTED" || row.status === "CANCELED")
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
        case when parent_dist.id is null then '-' else dist.name end as distributor_name
      from charge_requests cr
      join companies c on c.id = cr.company_id
      left join domains d on d.id = cr.domain_id
      left join distributors dist on dist.id = cr.distributor_id
      left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
      where 1 = 1
        ${scope.sql}
      order by cr.requested_at desc, cr.created_at desc
      limit ${DEFAULT_ROW_LIMIT}
    `,
    scope.values,
  );

  return splitRows(result.rows);
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
    : "dom.domain_name = $2";

  if (!domainValue) {
    if (input.user.role === "DOMAIN_ADMIN") {
      throw new Error("연결할 도메인을 선택해주세요.");
    }

    const distributorResult = await query<{
      company_id: string;
      distributor_id: string;
    }>(
      `
        select
          dist.company_id::text,
          dist.id::text as distributor_id
        from distributors dist
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where dist.status = 'ACTIVE'
          ${scope.sql}
        order by dist.created_at desc
        limit 1
      `,
      scope.values,
    );
    const distributor = distributorResult.rows[0];

    if (!distributor) {
      throw new Error("충전신청을 연결할 하부계정을 찾을 수 없습니다.");
    }

    return {
      companyId: distributor.company_id,
      domainId: null,
      distributorId: distributor.distributor_id,
    };
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

async function ensureIntegrationDbScope(input: {
  domainId?: string | null;
  domainName?: string;
  distributorId?: string | null;
}) {
  const domainValue = input.domainId ?? input.domainName;
  const domainPredicate = input.domainId
    ? "dom.id = $1::uuid"
    : "dom.domain_name = $1";

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
      input.bankName ?? null,
      input.accountNumber ?? null,
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
        dom.domain_name as name,
        dist.name as "distributorName"
      from domains dom
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
            select case when parent_dist.id is null then '-' else dist.name end
            from distributors dist
            left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
            where dist.id = charge_requests.distributor_id
          ) as distributor_name
      `,
      [input.id, nextStatus, input.processedBy],
    );
    const updated = updateResult.rows[0];

    if (!updated || nextStatus !== "APPROVED") {
      return updateResult;
    }

    const feeRateResult = await client.query<{
      company_rate: string;
      distributor_rate: string;
      agency_rate: string;
    }>(
      `
        select company_rate::text, distributor_rate::text, agency_rate::text
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
      updated.distributor_name !== "-";
    const companyRate = Number(feeRates?.company_rate ?? "0.2");
    const distributorRate = Number(feeRates?.distributor_rate ?? "0.1");
    const agencyRate = Number(
      feeRates?.agency_rate ?? (hasSubDistributor ? "0.1" : "0"),
    );
    const totalRate = companyRate + distributorRate + agencyRate;
    const companyFee = Math.floor(amount * (companyRate / 100));
    const distributorFee = Math.floor(amount * (distributorRate / 100));
    const savedCommission = Math.floor(amount * (totalRate / 100));

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

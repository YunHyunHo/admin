import { createHmac } from "node:crypto";

import { hasDatabaseUrl, query } from "@/lib/db";
import { KOREA_TIME_ZONE } from "@/lib/korean-time";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

type PaginationInput = {
  page?: string | null;
  pageSize?: string | null;
};

type DomainHistoryQuery = PaginationInput & {
  domainId?: string | null;
  domainName?: string | null;
  from?: string | null;
  to?: string | null;
  status?: string | null;
};

type DomainScope = {
  domainId: string;
  companyId: string;
  distributorId: string | null;
};

type ChargeHistoryRow = {
  id: string;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  depositor: string | null;
  user_uid: string | null;
  amount: string;
  requested_at: Date | string;
  processed_at: Date | string | null;
  updated_at: Date | string;
  status: RequestStatus;
  domain_admin_login_id: string | null;
};

type ExchangeHistoryRow = {
  id: string;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  amount: string;
  requested_at: Date | string;
  processed_at: Date | string | null;
  status: RequestStatus;
};

type SettlementAggregateRow = {
  date: string;
  charge_amount: string;
  fee_amount: string;
  exchange_amount: string;
};

function isUuid(value: string | null | undefined) {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  );
}

function normalizeStatus(value: string | null | undefined) {
  const status = value?.trim().toUpperCase();

  if (!status) {
    return null;
  }

  if (status === "PENDING" || status === "APPROVED" || status === "REJECTED") {
    return status;
  }

  throw new Error("상태값을 확인해주세요.");
}

function getPagination(input: PaginationInput) {
  const page = Math.max(1, Number(input.page ?? 1) || 1);
  const rawPageSize = Math.max(1, Number(input.pageSize ?? 10) || 10);
  const pageSize = Math.min(rawPageSize, 100);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function formatApiDateTime(value: Date | string | null) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREA_TIME_ZONE,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function formatApiDate(value: string) {
  return value.slice(2);
}

function getPublicChargeId(requestId: string, domainAdminLoginId: string | null) {
  const secret =
    process.env.PARTNER_TOKEN_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "local-dev-secret-change-me";

  return createHmac("sha256", secret)
    .update(`${domainAdminLoginId ?? "domain"}:${requestId}`)
    .digest("hex");
}

function dateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  while (cursor.getTime() <= end.getTime()) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const day = String(cursor.getUTCDate()).padStart(2, "0");

    dates.push(`${year}-${month}-${day}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

async function resolveDomainScope(input: {
  domainId?: string | null;
  domainName?: string | null;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("DB 연결 환경에서만 연동 조회 API를 사용할 수 있습니다.");
  }

  const domainId = input.domainId?.trim();
  const domainName = input.domainName?.trim();

  if (domainId && !isUuid(domainId)) {
    throw new Error("도메인 ID 형식을 확인해주세요.");
  }

  if (!domainId && !domainName) {
    throw new Error("조회할 도메인 정보가 필요합니다.");
  }

  const result = await query<DomainScope>(
    `
      select
        dom.id::text as "domainId",
        dom.company_id::text as "companyId",
        dom.distributor_id::text as "distributorId"
      from domains dom
      join companies c on c.id = dom.company_id
      where dom.status <> 'DELETED'
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
    throw new Error("연결된 도메인을 찾을 수 없습니다.");
  }

  return scope;
}

function appendHistoryFilters(
  clauses: string[],
  values: unknown[],
  column: string,
  input: Pick<DomainHistoryQuery, "from" | "to" | "status">,
) {
  const status = normalizeStatus(input.status);

  if (input.from) {
    values.push(input.from);
    clauses.push(`${column} >= $${values.length}::date`);
  }

  if (input.to) {
    values.push(input.to);
    clauses.push(`${column} < ($${values.length}::date + interval '1 day')`);
  }

  if (status) {
    values.push(status);
    clauses.push(`status = $${values.length}::request_status`);
  }
}

export async function getIntegrationChargeHistory(input: DomainHistoryQuery) {
  const scope = await resolveDomainScope(input);
  const { page, pageSize, offset } = getPagination(input);
  const values: unknown[] = [scope.domainId];
  const clauses = ["domain_id = $1::uuid"];

  appendHistoryFilters(clauses, values, "requested_at", input);

  values.push(pageSize, offset);
  const pageSizeParam = values.length - 1;
  const offsetParam = values.length;
  const whereSql = clauses.join(" and ");
  const result = await query<ChargeHistoryRow & { total_count: string }>(
    `
      select
        id::text,
        bank_name,
        account_number,
        account_holder,
        depositor,
        user_uid,
        amount::text,
        requested_at,
        processed_at,
        updated_at,
        status::text as status,
        domain_admin.login_id as domain_admin_login_id,
        count(*) over()::text as total_count
      from charge_requests
      left join lateral (
        select a.login_id
        from admin_domain_mappings adm
        join admins a on a.id = adm.admin_id
        where adm.domain_id = charge_requests.domain_id
          and a.role = 'DOMAIN_ADMIN'
          and a.status = 'ACTIVE'
        order by a.created_at desc
        limit 1
      ) domain_admin on true
      where ${whereSql}
      order by requested_at desc
      limit $${pageSizeParam}
      offset $${offsetParam}
    `,
    values,
  );
  const total = Number(result.rows[0]?.total_count ?? 0);

  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: getPublicChargeId(row.id, row.domain_admin_login_id),
      bankName: row.bank_name ?? "-",
      accountHolder: row.account_holder ?? "-",
      depositorName: row.account_holder ?? "-",
      accountNumber: row.account_number ?? "-",
      amount: Number(row.amount),
      buyer: row.depositor ?? "-",
      requestedAt: formatApiDateTime(row.requested_at),
      changedAt: formatApiDateTime(row.processed_at ?? row.requested_at),
      status: row.status,
    })),
    pagination: {
      page,
      pageSize,
      total,
    },
  };
}

export async function getIntegrationDomainExchangeHistory(input: DomainHistoryQuery) {
  const scope = await resolveDomainScope(input);
  const { page, pageSize, offset } = getPagination(input);
  const values: unknown[] = [scope.domainId];
  const clauses = ["domain_id = $1::uuid"];

  appendHistoryFilters(clauses, values, "requested_at", input);

  values.push(pageSize, offset);
  const pageSizeParam = values.length - 1;
  const offsetParam = values.length;
  const whereSql = clauses.join(" and ");
  const result = await query<ExchangeHistoryRow & { total_count: string }>(
    `
      select
        id::text,
        bank_name,
        account_holder,
        account_number,
        amount::text,
        requested_at,
        processed_at,
        status::text as status,
        count(*) over()::text as total_count
      from exchange_requests
      where ${whereSql}
      order by requested_at desc
      limit $${pageSizeParam}
      offset $${offsetParam}
    `,
    values,
  );
  const total = Number(result.rows[0]?.total_count ?? 0);

  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: row.id,
      bankName: row.bank_name ?? "-",
      accountHolder: row.account_holder ?? "-",
      accountNumber: row.account_number ?? "-",
      amount: Number(row.amount),
      requestedAt: formatApiDateTime(row.requested_at),
      completedAt: formatApiDateTime(row.processed_at),
      status: row.status,
    })),
    pagination: {
      page,
      pageSize,
      total,
    },
  };
}

export async function getIntegrationDomainSettlementHistory(input: {
  domainId?: string | null;
  domainName?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const scope = await resolveDomainScope(input);
  const from = input.from?.trim();
  const to = input.to?.trim();

  if (!from || !to) {
    throw new Error("조회 시작일과 종료일이 필요합니다.");
  }

  const baselineResult = await query<{
    charge_amount: string;
    fee_amount: string;
    exchange_amount: string;
  }>(
    `
      select
        coalesce(sum(source.charge_amount), 0)::text as charge_amount,
        coalesce(sum(source.fee_amount), 0)::text as fee_amount,
        coalesce(sum(source.exchange_amount), 0)::text as exchange_amount
      from (
        select
          cr.amount as charge_amount,
          coalesce(comm.saved_commission, 0) as fee_amount,
          0::numeric as exchange_amount
        from charge_requests cr
        left join commission_records comm on comm.charge_request_id = cr.id
        where cr.domain_id = $1::uuid
          and cr.status in ('APPROVED', 'COMPLETED')
          and cr.processed_at is not null
          and (cr.processed_at at time zone '${KOREA_TIME_ZONE}')::date < $2::date

        union all

        select
          0::numeric as charge_amount,
          0::numeric as fee_amount,
          er.amount as exchange_amount
        from exchange_requests er
        where er.domain_id = $1::uuid
          and er.status in ('APPROVED', 'COMPLETED')
          and er.processed_at is not null
          and (er.processed_at at time zone '${KOREA_TIME_ZONE}')::date < $2::date
      ) source
    `,
    [scope.domainId, from],
  );
  const aggregateResult = await query<SettlementAggregateRow>(
    `
      select
        source.date::text,
        coalesce(sum(source.charge_amount), 0)::text as charge_amount,
        coalesce(sum(source.fee_amount), 0)::text as fee_amount,
        coalesce(sum(source.exchange_amount), 0)::text as exchange_amount
      from (
        select
          (cr.processed_at at time zone '${KOREA_TIME_ZONE}')::date as date,
          cr.amount as charge_amount,
          coalesce(comm.saved_commission, 0) as fee_amount,
          0::numeric as exchange_amount
        from charge_requests cr
        left join commission_records comm on comm.charge_request_id = cr.id
        where cr.domain_id = $1::uuid
          and cr.status in ('APPROVED', 'COMPLETED')
          and cr.processed_at is not null
          and (cr.processed_at at time zone '${KOREA_TIME_ZONE}')::date >= $2::date
          and (cr.processed_at at time zone '${KOREA_TIME_ZONE}')::date <= $3::date

        union all

        select
          (er.processed_at at time zone '${KOREA_TIME_ZONE}')::date as date,
          0::numeric as charge_amount,
          0::numeric as fee_amount,
          er.amount as exchange_amount
        from exchange_requests er
        where er.domain_id = $1::uuid
          and er.status in ('APPROVED', 'COMPLETED')
          and er.processed_at is not null
          and (er.processed_at at time zone '${KOREA_TIME_ZONE}')::date >= $2::date
          and (er.processed_at at time zone '${KOREA_TIME_ZONE}')::date <= $3::date
      ) source
      group by source.date
      order by source.date asc
    `,
    [scope.domainId, from, to],
  );
  const aggregateMap = new Map(aggregateResult.rows.map((row) => [row.date, row]));
  const baseline = baselineResult.rows[0];
  let balanceAmount =
    Number(baseline?.charge_amount ?? 0) -
    Number(baseline?.fee_amount ?? 0) -
    Number(baseline?.exchange_amount ?? 0);
  const total = {
    chargeAmount: 0,
    feeAmount: 0,
    netChargeAmount: 0,
    exchangeAmount: 0,
    balanceAmount: 0,
  };
  const items = dateRange(from, to).map((date) => {
    const aggregate = aggregateMap.get(date);
    const chargeAmount = Number(aggregate?.charge_amount ?? 0);
    const feeAmount = Number(aggregate?.fee_amount ?? 0);
    const netChargeAmount = chargeAmount - feeAmount;
    const exchangeAmount = Number(aggregate?.exchange_amount ?? 0);

    balanceAmount += netChargeAmount - exchangeAmount;
    total.chargeAmount += chargeAmount;
    total.feeAmount += feeAmount;
    total.netChargeAmount += netChargeAmount;
    total.exchangeAmount += exchangeAmount;
    total.balanceAmount = balanceAmount;

    return {
      date: formatApiDate(date),
      chargeAmount,
      feeAmount,
      netChargeAmount,
      exchangeAmount,
      balanceAmount,
    };
  });

  return {
    ok: true,
    items,
    total,
  };
}

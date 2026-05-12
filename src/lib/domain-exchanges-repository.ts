import { hasDatabaseUrl, query } from "@/lib/db";
import type { DomainExchangeRow } from "@/lib/domain-exchanges-types";

type ExchangeRequestDbRow = {
  id: string;
  distributor_name: string | null;
  distributor_login_id: string | null;
  master_name: string | null;
  domain_name: string;
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
  domainName?: string;
  rawPayload?: unknown;
};

function formatStamp(value: Date | string | null) {
  if (!value) {
    return "";
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

function toStatus(status: ExchangeRequestDbRow["status"]): DomainExchangeRow["status"] {
  return status === "PENDING" ? "대기" : "승인";
}

function toExchangeRow(row: ExchangeRequestDbRow): DomainExchangeRow {
  const distributorName = row.distributor_name ?? "하부계정 없음";

  return {
    id: row.id,
    branch: distributorName,
    topDistributor: row.master_name ?? "마스터 관리자",
    distributor: distributorName,
    loginId: row.distributor_login_id ?? "-",
    domain: row.domain_name,
    bankName: row.bank_name ?? "-",
    accountHolder: row.account_holder ?? "-",
    accountNumber: row.account_number ?? "-",
    amount: Number(row.amount),
    requestedAt: formatStamp(row.requested_at),
    completedAt: formatStamp(row.processed_at),
    status: toStatus(row.status),
  };
}

export async function getDomainExchangeRows(fallbackRows: DomainExchangeRow[]) {
  if (!hasDatabaseUrl()) {
    return fallbackRows;
  }

  const result = await query<ExchangeRequestDbRow>(
    `
      select
        er.id::text,
        dist.name as distributor_name,
        dist_admin.login_id as distributor_login_id,
        master.name as master_name,
        dom.domain_name,
        er.bank_name,
        er.account_holder,
        er.account_number,
        er.amount::text,
        er.requested_at,
        er.processed_at,
        er.status::text as status
      from exchange_requests er
      join domains dom on dom.id = er.domain_id
      left join distributors dist on dist.id = er.distributor_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
      left join admins master on master.role = 'MASTER' and master.status = 'ACTIVE'
      order by er.requested_at desc
    `,
  );

  return result.rows.map(toExchangeRow);
}

async function findExchangeScope(domainName = "전체") {
  const result = await query<{
    company_id: string;
    domain_id: string;
    distributor_id: string | null;
  }>(
    `
      select
        dom.company_id::text,
        dom.id::text as domain_id,
        dom.distributor_id::text
      from domains dom
      where dom.domain_name = $1 and dom.status <> 'DELETED'
      order by dom.created_at desc
      limit 1
    `,
    [domainName],
  );
  const scope = result.rows[0];

  if (!scope) {
    throw new Error("환전신청을 연결할 도메인을 찾을 수 없습니다.");
  }

  return scope;
}

export async function createDomainExchange(input: CreateDomainExchangeInput) {
  const scope = await findExchangeScope(input.domainName);
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
  await query(
    `
      update exchange_requests
      set status = 'APPROVED',
          processed_at = coalesce(processed_at, now()),
          processed_by = $2::uuid,
          updated_at = now()
      where id = $1::uuid and status = 'PENDING'
    `,
    [id, processedBy],
  );
}

export async function deleteDomainExchange(id: string) {
  await query("delete from exchange_requests where id = $1::uuid", [id]);
}

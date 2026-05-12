import { hasDatabaseUrl, query } from "@/lib/db";
import { getScopedDistributorCondition } from "@/lib/master-scope";
import type { SessionUser } from "@/lib/auth";
import type {
  DomainDistributorOption,
  DomainRow,
} from "@/lib/domain-management-types";

type DomainDbRow = {
  id: string;
  distributor_id: string | null;
  domain_name: string;
  company_name: string;
  distributor_name: string | null;
  distributor_login_id: string | null;
  master_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  created_at: Date | string;
};

type DistributorOptionDbRow = {
  id: string;
  name: string;
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

function toDomainRow(row: DomainDbRow): DomainRow {
  const distributorName = row.distributor_name ?? "하부계정 없음";
  const topDistributor = row.master_name ?? "마스터 관리자";

  return {
    id: row.id,
    distributorId: row.distributor_id ?? undefined,
    headquarters: distributorName,
    topDistributor,
    distributor: distributorName,
    loginId: row.distributor_login_id ?? "-",
    companyName: row.company_name,
    url: row.domain_name,
    bankName: row.bank_name ?? "-",
    accountNumber: row.account_number ?? "-",
    accountHolder: row.account_holder ?? "-",
    depositEnabled: row.status === "ACTIVE",
    createdAt: formatStamp(row.created_at),
    users: [],
  };
}

export async function getDomainManagementRows(
  fallbackRows: DomainRow[],
  user?: SessionUser,
) {
  if (!hasDatabaseUrl()) {
    return fallbackRows;
  }
  const scope = user
    ? getScopedDistributorCondition(user)
    : { sql: "", values: [] as string[] };

  const result = await query<DomainDbRow>(
    `
      select
        dom.id::text,
        dom.distributor_id::text,
        dom.domain_name,
        c.company_name,
        dist.name as distributor_name,
        dist_admin.login_id as distributor_login_id,
        owner_master.name as master_name,
        ba.bank_name,
        ba.account_number,
        ba.account_holder,
        dom.status::text as status,
        dom.created_at
      from domains dom
      join companies c on c.id = dom.company_id
      left join distributors dist on dist.id = dom.distributor_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
      left join admins owner_master on owner_master.id = dist_admin.created_by
      left join lateral (
        select bank_name, account_number, account_holder
        from bank_accounts ba
        where ba.company_id = dom.company_id
          and (ba.distributor_id = dom.distributor_id or ba.distributor_id is null)
          and ba.is_active = true
        order by
          case when ba.distributor_id = dom.distributor_id then 0 else 1 end,
          ba.created_at desc
        limit 1
      ) ba on true
      where dom.status <> 'DELETED'
        ${scope.sql}
      order by dom.created_at desc
    `,
    scope.values,
  );

  return result.rows.map(toDomainRow);
}

export async function getDomainBoardData(fallbackRows: DomainRow[], user?: SessionUser) {
  if (!hasDatabaseUrl()) {
    return {
      rows: fallbackRows,
      distributorOptions: [] satisfies DomainDistributorOption[],
    };
  }

  const [rows, distributorOptions] = await Promise.all([
    getDomainManagementRows(fallbackRows, user),
    query<DistributorOptionDbRow>(
      `
        select dist.id::text, dist.name
        from distributors dist
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where dist.status = 'ACTIVE'
          ${user ? getScopedDistributorCondition(user).sql : ""}
        order by name asc
      `,
      user ? getScopedDistributorCondition(user).values : [],
    ),
  ]);

  return {
    rows,
    distributorOptions: distributorOptions.rows,
  };
}

export async function createDomain(input: {
  domainName: string;
  distributorId: string;
}) {
  const distributor = await query<{ company_id: string }>(
    `
      select company_id::text
      from distributors
      where id = $1::uuid and status = 'ACTIVE'
    `,
    [input.distributorId],
  );
  const companyId = distributor.rows[0]?.company_id;

  if (!companyId) {
    throw new Error("하부계정을 찾을 수 없습니다.");
  }

  await query(
    `
      insert into domains (domain_name, company_id, distributor_id, status)
      values ($1, $2::uuid, $3::uuid, 'ACTIVE')
      on conflict (domain_name) do update
      set
        company_id = excluded.company_id,
        distributor_id = excluded.distributor_id,
        status = 'ACTIVE',
        updated_at = now()
    `,
    [input.domainName, companyId, input.distributorId],
  );
}

export async function updateDomain(input: {
  id: string;
  domainName?: string;
  distributorId?: string;
  depositEnabled?: boolean;
}) {
  const distributor = input.distributorId
    ? await query<{ company_id: string }>(
        `
          select company_id::text
          from distributors
          where id = $1::uuid and status = 'ACTIVE'
        `,
        [input.distributorId],
      )
    : null;
  const companyId = distributor?.rows[0]?.company_id ?? null;

  if (input.distributorId && !companyId) {
    throw new Error("하부계정을 찾을 수 없습니다.");
  }

  await query(
    `
      update domains
      set
        domain_name = coalesce($2, domain_name),
        distributor_id = coalesce($3::uuid, distributor_id),
        company_id = coalesce($4::uuid, company_id),
        status = coalesce($5::admin_status, status),
        updated_at = now()
      where id = $1::uuid
    `,
    [
      input.id,
      input.domainName ?? null,
      input.distributorId ?? null,
      companyId,
      typeof input.depositEnabled === "boolean"
        ? input.depositEnabled
          ? "ACTIVE"
          : "SUSPENDED"
        : null,
    ],
  );
}

export async function deleteDomain(id: string) {
  await query(
    `
      update domains
      set status = 'DELETED', updated_at = now()
      where id = $1::uuid
    `,
    [id],
  );
}

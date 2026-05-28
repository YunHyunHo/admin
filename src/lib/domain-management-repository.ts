import { hasDatabaseUrl, query } from "@/lib/db";
import { formatKoreanDateTime } from "@/lib/korean-time";
import { getScopedDistributorCondition } from "@/lib/master-scope";
import type { SessionUser } from "@/lib/auth";
import type {
  DomainDistributorOption,
  DomainRow,
} from "@/lib/domain-management-types";

const DEFAULT_ROW_LIMIT = 200;

type DomainDbRow = {
  id: string;
  distributor_id: string | null;
  domain_name: string | null;
  company_name: string;
  distributor_name: string | null;
  distributor_login_id: string | null;
  top_distributor_name: string | null;
  child_distributor_names: string | null;
  current_balance: string | null;
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
  return formatKoreanDateTime(value);
}

function toDomainRow(row: DomainDbRow): DomainRow {
  const topDistributor = row.top_distributor_name ?? "-";
  const distributorName =
    row.distributor_name ?? row.child_distributor_names ?? "-";

  return {
    id: row.id,
    distributorId: row.distributor_id ?? undefined,
    headquarters: distributorName === "-" ? topDistributor : distributorName,
    topDistributor,
    distributor: distributorName,
    loginId: row.distributor_login_id ?? "-",
    companyName: row.company_name,
    url: row.domain_name ?? "",
    balance: Number(row.current_balance ?? 0),
    bankName: row.bank_name ?? "-",
    accountNumber: row.account_number ?? "-",
    accountHolder: row.account_holder ?? "-",
    accountLinked: Boolean(row.bank_name || row.account_number || row.account_holder),
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
    ? getDomainManagementScopeCondition(user)
    : { sql: "", values: [] as string[] };

  const result = await query<DomainDbRow>(
    `
      select
        dom.id::text,
        dom.distributor_id::text,
        dom.domain_name,
        c.company_name,
        case when parent_dist.id is null then null else dist.name end as distributor_name,
        dist_admin.login_id as distributor_login_id,
        coalesce(parent_dist.name, dist.name) as top_distributor_name,
        child_dist.names as child_distributor_names,
        dist.current_balance::text as current_balance,
        ba.bank_name,
        ba.account_number,
        ba.account_holder,
        dom.status::text as status,
        dom.created_at
      from domains dom
      join companies c on c.id = dom.company_id
      left join distributors dist on dist.id = dom.distributor_id
      left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
      left join lateral (
        select string_agg(child.name, ', ' order by child.name) as names
        from distributors child
        where child.parent_distributor_id = dist.id
          and child.status = 'ACTIVE'
      ) child_dist on parent_dist.id is null
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
      limit ${DEFAULT_ROW_LIMIT}
    `,
    scope.values,
  );

  return result.rows.map(toDomainRow);
}

function getDomainManagementScopeCondition(user: SessionUser) {
  return user.role === "MASTER"
    ? { sql: "", values: [] as string[] }
    : getScopedDistributorCondition(user);
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
          ${user ? getDomainManagementScopeCondition(user).sql : ""}
        order by name asc
        limit ${DEFAULT_ROW_LIMIT}
      `,
      user ? getDomainManagementScopeCondition(user).values : [],
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

import { hasDatabaseUrl, query } from "@/lib/db";
import { formatKoreanDateTime } from "@/lib/korean-time";
import { getScopedDistributorCondition } from "@/lib/master-scope";
import type { SessionUser } from "@/lib/auth";
import type {
  AccountBranchOption,
  AccountRow,
  LinkedDomain,
} from "@/lib/bank-accounts-types";

type BankAccountDbRow = {
  id: string;
  company_id: string | null;
  distributor_id: string | null;
  distributor_name: string | null;
  creator_name: string | null;
  bank_name: string;
  account_number: string;
  account_holder: string;
  is_active: boolean;
  created_at: Date | string;
  linked_domains: LinkedDomain[] | null;
};

type DistributorOptionDbRow = {
  id: string;
  name: string;
};

function formatStamp(value: Date | string | null) {
  return formatKoreanDateTime(value);
}

function toAccountRow(row: BankAccountDbRow): AccountRow {
  return {
    id: row.id,
    ...(row.company_id ? { companyId: row.company_id } : {}),
    ...(row.distributor_id ? { distributorId: row.distributor_id } : {}),
    branchName: row.distributor_name ?? "본사",
    creator: row.creator_name ?? "마스터 관리자",
    bankName: row.bank_name,
    holder: row.account_holder,
    accountNumber: row.account_number,
    createdAt: formatStamp(row.created_at),
    isActive: row.is_active,
    linkedDomains: row.linked_domains ?? [],
  };
}

export async function getBankAccountBoardData(user?: SessionUser) {
  if (!hasDatabaseUrl()) {
    return {
      accounts: [] satisfies AccountRow[],
      branchOptions: [] satisfies AccountBranchOption[],
    };
  }
  const scope = user
    ? user.role === "MASTER"
      ? { sql: "", values: [] as string[] }
      : getScopedDistributorCondition(user)
    : { sql: "", values: [] as string[] };
  const accountScopeSql =
    user?.role === "MASTER"
      ? ""
      : scope.sql.replaceAll("dist.", "d.");

  const [accounts, branchOptions] = await Promise.all([
    query<BankAccountDbRow>(
      `
        select
          ba.id::text,
          ba.company_id::text,
          ba.distributor_id::text,
          d.name as distributor_name,
          owner_master.name as creator_name,
          ba.bank_name,
          ba.account_number,
          ba.account_holder,
          ba.is_active,
          ba.created_at,
          coalesce(
            jsonb_agg(
              distinct jsonb_build_object(
                'id', dom.id::text,
                'name', coalesce(dom_company.company_name, nullif(dom.domain_name, ''), '-'),
                'address', coalesce(nullif(dom.domain_name, ''), '-'),
                'userCount', 0
              )
            ) filter (where dom.id is not null),
            '[]'::jsonb
          ) as linked_domains
        from bank_accounts ba
        left join distributors d on d.id = ba.distributor_id
        left join admins dist_admin on dist_admin.id = d.admin_id
        left join admins owner_master on owner_master.id = dist_admin.created_by
        left join domains dom on (
          dom.distributor_id = ba.distributor_id
          or (
            ba.distributor_id is null
            and ba.company_id is not null
            and dom.company_id = ba.company_id
          )
        )
          and dom.status <> 'DELETED'
        left join companies dom_company on dom_company.id = dom.company_id
        where 1 = 1
          ${accountScopeSql}
        group by ba.id, d.name, owner_master.name
        order by ba.created_at desc
      `,
      scope.values,
    ),
    query<DistributorOptionDbRow>(
      `
        select dist.id::text, dist.name
        from distributors dist
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where dist.status = 'ACTIVE'
          ${scope.sql}
        order by name asc
      `,
      scope.values,
    ),
  ]);

  return {
    accounts: accounts.rows.map(toAccountRow),
    branchOptions: branchOptions.rows,
  };
}

export async function createBankAccount(
  input: {
    bankName: string;
    holder: string;
    accountNumber: string;
  },
  _user: SessionUser,
) {
  void _user;

  await query(
    `
      insert into bank_accounts (
        company_id,
        distributor_id,
        bank_name,
        account_number,
        account_holder
      )
      values ($1::uuid, $2::uuid, $3, $4, $5)
    `,
    [
      null,
      null,
      input.bankName,
      input.accountNumber,
      input.holder,
    ],
  );
}

export async function updateBankAccount(input: {
  id: string;
  holder?: string;
  accountNumber?: string;
  isActive?: boolean;
}) {
  await query(
    `
      update bank_accounts
      set
        account_holder = coalesce($2, account_holder),
        account_number = coalesce($3, account_number),
        is_active = coalesce($4, is_active),
        updated_at = now()
      where id = $1::uuid
    `,
    [
      input.id,
      input.holder ?? null,
      input.accountNumber ?? null,
      input.isActive ?? null,
    ],
  );
}

export async function deleteBankAccount(id: string) {
  await query("delete from bank_accounts where id = $1::uuid", [id]);
}

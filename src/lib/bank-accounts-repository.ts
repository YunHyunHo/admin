import { hasDatabaseUrl, query } from "@/lib/db";
import { formatKoreanDateTime } from "@/lib/korean-time";
import {
  getMasterOwnedBankAccountCondition,
  getMasterOwnedCompanyExistsCondition,
  getScopedDistributorCondition,
} from "@/lib/master-scope";
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
    ? getScopedDistributorCondition(user)
    : { sql: "", values: [] as string[] };
  const accountScopeSql =
    user?.role === "MASTER"
      ? `and ${getMasterOwnedBankAccountCondition("ba")}`
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
        left join domains dom
          on dom.linked_bank_account_id = ba.id
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
        account_holder,
        created_by
      )
      values ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid)
    `,
    [
      null,
      null,
      input.bankName,
      input.accountNumber,
      input.holder,
      _user.id,
    ],
  );
}

export async function updateBankAccount(input: {
  id: string;
  bankName?: string;
  holder?: string;
  accountNumber?: string;
  isActive?: boolean;
  user: SessionUser;
}) {
  await query(
    `
      update bank_accounts ba
      set
        bank_name = coalesce($2, bank_name),
        account_holder = coalesce($3, account_holder),
        account_number = coalesce($4, account_number),
        is_active = coalesce($5, is_active),
        updated_at = now()
      where ba.id = $1::uuid
        and ${getMasterOwnedBankAccountCondition("ba", "$6")}
    `,
    [
      input.id,
      input.bankName ?? null,
      input.holder ?? null,
      input.accountNumber ?? null,
      input.isActive ?? null,
      input.user.id,
    ],
  );
}

export async function deleteBankAccount(id: string, user: SessionUser) {
  await query(
    `
      delete from bank_accounts ba
      where ba.id = $1::uuid
        and ${getMasterOwnedBankAccountCondition("ba", "$2")}
    `,
    [id, user.id],
  );
}

export async function unlinkDomainFromBankAccount(input: {
  accountId: string;
  domainId: string;
  user: SessionUser;
}) {
  const result = await query(
    `
      update domains dom
      set
        linked_bank_account_id = null,
        updated_at = now()
      where dom.id = $2::uuid
        and dom.linked_bank_account_id = $1::uuid
        and dom.status <> 'DELETED'
        and ${getMasterOwnedCompanyExistsCondition("dom.company_id", "$3")}
        and exists (
          select 1
          from bank_accounts ba
          where ba.id = $1::uuid
            and ${getMasterOwnedBankAccountCondition("ba", "$3")}
        )
    `,
    [input.accountId, input.domainId, input.user.id],
  );

  if (!result.rowCount) {
    throw new Error("해제할 계좌 연동 정보를 찾지 못했습니다.");
  }
}

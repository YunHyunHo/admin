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
    distributorId: row.distributor_id ?? undefined,
    branchName: row.distributor_name ?? "하부계정 없음",
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

  const [accounts, branchOptions] = await Promise.all([
    query<BankAccountDbRow>(
      `
        select
          ba.id::text,
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
                'name', dom.domain_name,
                'address', dom.domain_name,
                'userCount', 0
              )
            ) filter (where dom.id is not null),
            '[]'::jsonb
          ) as linked_domains
        from bank_accounts ba
        left join distributors d on d.id = ba.distributor_id
        left join admins dist_admin on dist_admin.id = d.admin_id
        left join admins owner_master on owner_master.id = dist_admin.created_by
        left join domains dom on dom.company_id = ba.company_id
        where 1 = 1
          ${scope.sql.replaceAll("dist.", "d.")}
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
    distributorId: string;
    bankName: string;
    holder: string;
    accountNumber: string;
  },
  user: SessionUser,
) {
  const distributor = await query<{ id: string; company_id: string | null }>(
    `
      select dist.id::text, dist.company_id::text
      from distributors dist
      left join admins dist_admin on dist_admin.id = dist.admin_id
      where dist.id = $1::uuid
        and dist.status = 'ACTIVE'
        and dist_admin.created_by = $2::uuid
    `,
    [input.distributorId, user.id],
  );

  if (distributor.rows.length !== 1) {
    throw new Error("하부계정을 찾을 수 없습니다.");
  }

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
      distributor.rows[0].company_id,
      distributor.rows[0].id,
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

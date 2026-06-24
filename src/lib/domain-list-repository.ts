import { hashPassword } from "@/lib/password";
import { decryptVisiblePassword, encryptVisiblePassword } from "@/lib/admin-accounts";
import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";
import { getDomainManagementRows } from "@/lib/domain-management-repository";
import {
  getMasterOwnedBankAccountCondition,
  getMasterOwnedCompanyExistsCondition,
  getScopedDistributorCondition,
} from "@/lib/master-scope";
import type { SessionUser } from "@/lib/auth";

export type DomainListOwnerOption = {
  id: string;
  name: string;
  role: "HEADQUARTERS" | "TOP_DISTRIBUTOR" | "DISTRIBUTOR";
};

type DomainMappedCompanyRow = {
  domain_id: string;
  login_id: string;
  visible_password: string | null;
};

export type DomainListRow = {
  id: string;
  companyId?: string;
  distributorId?: string;
  headquarters: string;
  topDistributor: string;
  distributor: string;
  agency: string;
  loginId: string;
  visiblePassword: string;
  companyName: string;
  url: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  withdrawBankName: string;
  withdrawAccountHolder: string;
  withdrawAccountNumber: string;
  balance: number;
  depositEnabled: boolean;
  createdAt: string;
};

type DomainCompanyAdminRow = {
  id: string;
  company_id: string;
  domain_name: string | null;
  company_name: string;
  distributor_name: string | null;
  top_distributor_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  current_balance: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  created_at: Date | string;
};

type CreateDomainEntryInput = {
  ownerDistributorId: string;
  url: string;
  domainName: string;
  loginId: string;
  password: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  createdById: string;
};

function normalizeUrl(value: string) {
  const normalized = value.trim();
  return normalized === "-" ? "" : normalized;
}

const HEADQUARTERS_OWNER_ID = "HEADQUARTERS";

function isUuid(value: string | undefined) {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  );
}

export async function getDomainListBoardData(user: SessionUser) {
  const scope = getScopedDistributorCondition(user);
  const domainAdminScope =
    user.role === "MASTER"
      ? { sql: "and a.created_by = $1::uuid", values: [user.id] }
      : user.role === "DOMAIN_ADMIN"
        ? { sql: "and a.id = $1::uuid", values: [user.id] }
        : { sql: "and a.created_by = $1::uuid", values: [user.id] };
  const [rows, distributorOptions, mappedDomains] = await Promise.all([
    getDomainManagementRows([], user),
    query<DomainListOwnerOption>(
      `
        select
          dist.id::text as id,
          dist.name,
          case
            when dist.parent_distributor_id is null then 'TOP_DISTRIBUTOR'
            else 'DISTRIBUTOR'
          end as role
        from distributors dist
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where dist.status = 'ACTIVE'
          ${scope.sql}
        order by dist.name asc
      `,
      scope.values,
    ),
    query<DomainMappedCompanyRow>(
      `
        select
          adm.domain_id::text as domain_id,
          a.login_id,
          a.password_ciphertext as visible_password
        from admins a
        join admin_domain_mappings adm on adm.admin_id = a.id
        where a.role = 'DOMAIN_ADMIN'
          and a.status = 'ACTIVE'
          ${domainAdminScope.sql}
      `,
      domainAdminScope.values,
    ),
  ]);
  const domainAdminByDomainId = new Map(
    mappedDomains.rows.map((row) => [
      row.domain_id,
      {
        loginId: row.login_id,
        visiblePassword: row.visible_password
          ? decryptVisiblePassword(row.visible_password)
          : "저장된 비밀번호를 확인할 수 없습니다.",
      },
    ]),
  );

  const listRows = rows.map((row) => {
    const domainAdmin = domainAdminByDomainId.get(row.id);

    if (!domainAdmin) {
      return null;
    }

    return {
      id: row.id,
      ...(row.companyId ? { companyId: row.companyId } : {}),
      ...(row.distributorId ? { distributorId: row.distributorId } : {}),
      headquarters: "본사",
      topDistributor: row.topDistributor,
      distributor: row.distributor,
      agency: row.companyName,
      loginId: domainAdmin?.loginId ?? "-",
      visiblePassword: domainAdmin?.visiblePassword ?? "저장된 비밀번호를 확인할 수 없습니다.",
      companyName: row.companyName,
      url: row.url,
      bankName: row.bankName,
      accountNumber: row.accountNumber,
      accountHolder: row.accountHolder,
      withdrawBankName: row.withdrawBankName,
      withdrawAccountHolder: row.withdrawAccountHolder,
      withdrawAccountNumber: row.withdrawAccountNumber,
      balance: row.balance,
      depositEnabled: row.depositEnabled,
      createdAt: row.createdAt,
    };
  }).filter((row): row is DomainListRow => row !== null);

  return {
    rows: listRows,
    ownerOptions: [
      { id: HEADQUARTERS_OWNER_ID, name: "본사", role: "HEADQUARTERS" as const },
      ...distributorOptions.rows,
    ],
  };
}

export async function createDomainEntry(input: CreateDomainEntryInput) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL 환경변수를 설정해주세요.");
  }

  const ownerDistributorId =
    input.ownerDistributorId === HEADQUARTERS_OWNER_ID ? null : input.ownerDistributorId;

  if (ownerDistributorId && !isUuid(ownerDistributorId)) {
    throw new Error("소속 계정을 선택해주세요.");
  }

  const domainName = input.domainName.trim();
  const url = normalizeUrl(input.url);
  const loginId = input.loginId.trim();

  if (!domainName) {
    throw new Error("도메인 이름을 입력해주세요.");
  }

  if (!/^[A-Za-z][A-Za-z0-9_]{3,}$/.test(loginId)) {
    throw new Error("로그인 아이디는 영문 시작, 4글자 이상이어야 합니다.");
  }

  if (input.password.trim().length < 4) {
    throw new Error("비밀번호는 4글자 이상 입력해주세요.");
  }

  if (!input.bankName.trim() || !input.accountHolder.trim() || !input.accountNumber.trim()) {
    throw new Error("은행, 예금주, 계좌번호를 모두 입력해주세요.");
  }

  try {
    await withTransaction(async (client) => {
      const duplicateLogin = await client.query<{ id: string }>(
        `
          select id::text
          from admins
          where login_id = $1
          limit 1
        `,
        [loginId],
      );

      if (duplicateLogin.rows[0]) {
        throw new Error("이미 사용 중인 로그인 아이디입니다.");
      }

      const duplicateCompany = await client.query<{ id: string }>(
        `
          select c.id::text
          from companies c
          where c.company_name = $1
            and ${getMasterOwnedCompanyExistsCondition("c.id", "$2")}
          limit 1
        `,
        [domainName, input.createdById],
      );

      if (duplicateCompany.rows[0]) {
        throw new Error("이미 사용 중인 도메인 이름입니다.");
      }

      if (url) {
        const duplicateUrl = await client.query<{ id: string }>(
          `
            select id::text
            from domains
            where domain_name = $1
            limit 1
          `,
          [url],
        );

        if (duplicateUrl.rows[0]) {
          throw new Error("이미 사용 중인 URL입니다.");
        }
      }

      if (ownerDistributorId) {
        const distributorResult = await client.query<{ id: string }>(
          `
            select distributors.id::text
            from distributors
            join admins dist_admin on dist_admin.id = distributors.admin_id
            where distributors.id = $1::uuid
              and distributors.status = 'ACTIVE'
              and dist_admin.created_by = $2::uuid
            limit 1
          `,
          [ownerDistributorId, input.createdById],
        );

        if (!distributorResult.rows[0]) {
          throw new Error("선택한 소속 계정을 찾지 못했습니다.");
        }
      }

      const companyResult = await client.query<{ id: string }>(
        `
          insert into companies (company_name, status)
          values ($1, 'ACTIVE')
          returning id::text
        `,
        [domainName],
      );

      const companyId = companyResult.rows[0]?.id;

      if (!companyId) {
        throw new Error("도메인 업체 생성에 실패했습니다.");
      }

      const passwordHash = await hashPassword(input.password);
      const encryptedPassword = encryptVisiblePassword(input.password);
      const adminResult = await client.query<{ id: string }>(
        `
          insert into admins (
            login_id,
            password_hash,
            password_ciphertext,
            name,
            role,
            status,
            created_by
          )
          values ($1, $2, $3, $4, 'DOMAIN_ADMIN', 'ACTIVE', $5::uuid)
          returning id::text
        `,
        [loginId, passwordHash, encryptedPassword, domainName, input.createdById],
      );

      const adminId = adminResult.rows[0]?.id;

      if (!adminId) {
        throw new Error("도메인 로그인 계정 생성에 실패했습니다.");
      }

      await client.query(
        `
          insert into admin_company_mappings (admin_id, company_id)
          values ($1::uuid, $2::uuid)
          on conflict (admin_id, company_id) do nothing
        `,
        [adminId, companyId],
      );

      const domainResult = await client.query<{ id: string }>(
        `
          insert into domains (domain_name, company_id, distributor_id, status)
          values ($1, $2::uuid, $3::uuid, 'ACTIVE')
          returning id::text
        `,
        [url || null, companyId, ownerDistributorId],
      );

      const domainId = domainResult.rows[0]?.id;

      if (!domainId) {
        throw new Error("도메인 생성에 실패했습니다.");
      }

      await client.query(
        `
          insert into admin_domain_mappings (admin_id, domain_id)
          values ($1::uuid, $2::uuid)
          on conflict (admin_id, domain_id) do nothing
        `,
        [adminId, domainId],
      );

      const accountResult = await client.query<{ id: string }>(
        `
          insert into bank_accounts (
            company_id,
            distributor_id,
            bank_name,
            account_number,
            account_holder,
            created_by,
            is_active
          )
          values ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, true)
          returning id::text
        `,
        [
          companyId,
          ownerDistributorId,
          input.bankName.trim(),
          input.accountNumber.trim(),
          input.accountHolder.trim(),
          input.createdById,
        ],
      );

      const linkedAccountId = accountResult.rows[0]?.id;

      if (!linkedAccountId) {
        throw new Error("도메인 계좌 생성에 실패했습니다.");
      }

      await client.query(
        `
          update domains
          set linked_bank_account_id = $2::uuid
          where id = $1::uuid
        `,
        [domainId, linkedAccountId],
      );
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      const detail = "detail" in error ? String((error as { detail?: string }).detail ?? "") : "";

      if (detail.includes("domains_domain_name_key")) {
        throw new Error("이미 사용 중인 URL입니다.");
      }

      if (detail.includes("admins_login_id_key")) {
        throw new Error("이미 사용 중인 로그인 아이디입니다.");
      }

      if (detail.includes("companies_company_name_key")) {
        throw new Error("이미 사용 중인 도메인 이름입니다.");
      }
    }

    throw error;
  }
}

export async function updateDomainEntryStatus(input: {
  id: string;
  depositEnabled: boolean;
  user: SessionUser;
}) {
  await query(
    `
      update domains dom
      set
        status = $2::admin_status,
        updated_at = now()
      where dom.id = $1::uuid
        and dom.status <> 'DELETED'
        and ${getMasterOwnedCompanyExistsCondition("dom.company_id", "$3")}
    `,
    [input.id, input.depositEnabled ? "ACTIVE" : "SUSPENDED", input.user.id],
  );
}

export async function updateDomainEntryAccount(input: {
  id: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  user: SessionUser;
}) {
  if (!isUuid(input.id)) {
    throw new Error("도메인 정보를 확인해주세요.");
  }

  if (!input.bankName.trim() || !input.accountHolder.trim() || !input.accountNumber.trim()) {
    throw new Error("은행, 예금주, 계좌번호를 모두 입력해주세요.");
  }

  await withTransaction(async (client) => {
    const updateAccountScopeSql =
      input.user.role === "MASTER"
        ? `and ${getMasterOwnedBankAccountCondition("bank_accounts", "$5")}`
        : "";
    const domainResult = await client.query<{
      company_id: string;
      distributor_id: string | null;
      account_id: string | null;
    }>(
      `
        select
          dom.company_id::text,
          dom.distributor_id::text,
          dom.linked_bank_account_id::text as account_id
        from domains dom
        where dom.id = $1::uuid
          and dom.status <> 'DELETED'
          and ${getMasterOwnedCompanyExistsCondition("dom.company_id", "$2")}
        limit 1
      `,
      [input.id, input.user.id],
    );

    const domain = domainResult.rows[0];

    if (!domain?.company_id) {
      throw new Error("도메인 정보를 찾지 못했습니다.");
    }

    if (domain.account_id) {
      const updateResult = await client.query(
        `
          update bank_accounts
          set
            bank_name = $2,
            account_number = $3,
            account_holder = $4,
            created_by = coalesce(created_by, $5::uuid),
            is_active = true,
            updated_at = now()
          where id = $1::uuid
            ${updateAccountScopeSql}
        `,
        [
          domain.account_id,
          input.bankName.trim(),
          input.accountNumber.trim(),
          input.accountHolder.trim(),
          input.user.id,
        ],
      );

      if (!updateResult.rowCount) {
        throw new Error("연결된 계좌를 수정할 권한이 없습니다.");
      }
      return;
    }

    const insertResult = await client.query<{ id: string }>(
      `
        insert into bank_accounts (
          company_id,
          distributor_id,
          bank_name,
          account_number,
          account_holder,
          created_by,
          is_active
        )
        values ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, true)
        returning id::text
      `,
      [
        domain.company_id,
        domain.distributor_id,
        input.bankName.trim(),
        input.accountNumber.trim(),
        input.accountHolder.trim(),
        input.user.id,
      ],
    );

    const linkedAccountId = insertResult.rows[0]?.id;

    if (!linkedAccountId) {
      throw new Error("도메인 계좌 생성에 실패했습니다.");
    }

    await client.query(
      `
        update domains dom
        set
          linked_bank_account_id = $2::uuid,
          updated_at = now()
        where dom.id = $1::uuid
          and ${getMasterOwnedCompanyExistsCondition("dom.company_id", "$3")}
      `,
      [input.id, linkedAccountId, input.user.id],
    );
  });
}

export async function updateDomainWithdrawAccount(input: {
  id: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  user: SessionUser;
}) {
  if (!isUuid(input.id)) {
    throw new Error("도메인 정보를 확인해주세요.");
  }

  if (!input.bankName.trim() || !input.accountHolder.trim() || !input.accountNumber.trim()) {
    throw new Error("출금은행, 예금주, 계좌번호를 모두 입력해주세요.");
  }

  const result = await query(
    `
      update domains dom
      set
        withdraw_bank_name = $2,
        withdraw_account_holder = $3,
        withdraw_account_number = $4,
        updated_at = now()
      where dom.id = $1::uuid
        and dom.status <> 'DELETED'
        and ${getMasterOwnedCompanyExistsCondition("dom.company_id", "$5")}
    `,
    [
      input.id,
      input.bankName.trim(),
      input.accountHolder.trim(),
      input.accountNumber.trim(),
      input.user.id,
    ],
  );

  if (!result.rowCount) {
    throw new Error("출금 계좌를 수정할 도메인을 찾지 못했습니다.");
  }
}

export async function linkDomainEntryAccount(input: {
  id: string;
  accountId: string;
  user: SessionUser;
}) {
  if (!isUuid(input.id) || !isUuid(input.accountId)) {
    throw new Error("도메인 또는 계좌 정보를 확인해주세요.");
  }

  const bankAccountScopeSql =
    input.user.role === "MASTER"
      ? `and ${getMasterOwnedBankAccountCondition("ba", "$3")}`
      : "";
  const accountResult = await query<{
    bank_name: string;
    account_number: string;
    account_holder: string;
  }>(
    `
      select
        ba.bank_name,
        ba.account_number,
        ba.account_holder
      from domains dom
      join bank_accounts ba on ba.id = $2::uuid
      where dom.id = $1::uuid
        and dom.status <> 'DELETED'
        and ba.is_active = true
        and ${getMasterOwnedCompanyExistsCondition("dom.company_id", "$3")}
        ${bankAccountScopeSql}
      limit 1
    `,
    [input.id, input.accountId, input.user.id],
  );

  const selected = accountResult.rows[0];

  if (!selected) {
    throw new Error("선택한 계좌를 이 도메인에 연결할 수 없습니다.");
  }

  const result = await query(
    `
      update domains dom
      set
        linked_bank_account_id = $2::uuid,
        updated_at = now()
      where dom.id = $1::uuid
        and dom.status <> 'DELETED'
        and ${getMasterOwnedCompanyExistsCondition("dom.company_id", "$3")}
    `,
    [input.id, input.accountId, input.user.id],
  );

  if (!result.rowCount) {
    throw new Error("계좌를 연동할 도메인을 찾지 못했습니다.");
  }
}

export async function deleteDomainEntry(id: string, user: SessionUser) {
  await deleteDomainEntryWithAccount(id, false, user);
}

async function deleteDomainEntryWithAccount(id: string, hardDelete: boolean, user: SessionUser) {
  if (!isUuid(id)) {
    throw new Error("도메인 정보를 확인해주세요.");
  }

  await withTransaction(async (client) => {
    const bankAccountScopeSql =
      user.role === "MASTER"
        ? `and ${getMasterOwnedBankAccountCondition("ba", "$2")}`
        : "";
    const deleteBankAccountScopeSql =
      user.role === "MASTER"
        ? `and ${getMasterOwnedBankAccountCondition("bank_accounts", "$2")}`
        : "";
    const domainRow = await client.query<DomainCompanyAdminRow>(
      `
        select
          dom.id::text,
          dom.company_id::text,
          dom.domain_name,
          c.company_name,
          dist.name as distributor_name,
          parent_dist.name as top_distributor_name,
          ba.bank_name,
          ba.account_number,
          ba.account_holder,
          dom.current_balance::text as current_balance,
          dom.status::text as status,
          dom.created_at
        from domains dom
        join companies c on c.id = dom.company_id
        left join distributors dist on dist.id = dom.distributor_id
        left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
        left join lateral (
          select bank_name, account_number, account_holder
          from bank_accounts ba
          where ba.company_id = dom.company_id
            ${bankAccountScopeSql}
          order by ba.created_at desc
          limit 1
        ) ba on true
        where dom.id = $1::uuid
          and ${getMasterOwnedCompanyExistsCondition("dom.company_id", "$2")}
        limit 1
      `,
      [id, user.id],
    );

    const companyId = domainRow.rows[0]?.company_id;
    const companyName = domainRow.rows[0]?.company_name;

    if (!companyId || !companyName) {
      throw new Error("도메인 정보를 찾지 못했습니다.");
    }

    const adminResult = await client.query<{ id: string }>(
      `
        select a.id::text
        from admins a
        join admin_company_mappings acm on acm.admin_id = a.id
        where a.role = 'DOMAIN_ADMIN'
          and acm.company_id = $1::uuid
          and a.created_by = $2::uuid
        limit 1
      `,
      [companyId, user.id],
    );

    const adminId = adminResult.rows[0]?.id ?? null;

    if (hardDelete) {
      if (adminId) {
        await client.query(`delete from admin_domain_mappings where admin_id = $1::uuid`, [adminId]);
        await client.query(`delete from admin_company_mappings where admin_id = $1::uuid`, [adminId]);
        await client.query(`delete from admins where id = $1::uuid`, [adminId]);
      }

      await client.query(
        `
          delete from bank_accounts
          where company_id in (
            select company_id
            from domains
            where id = $1::uuid
          )
            ${deleteBankAccountScopeSql}
        `,
        [id, user.id],
      );
      await client.query(`delete from domains where id = $1::uuid`, [id]);
      await client.query(
        `
          delete from companies
          where id = $1::uuid
        `,
        [companyId],
      );
      return;
    }

    if (adminId) {
      await client.query(
        `
          update admins
          set status = 'DELETED', updated_at = now()
          where id = $1::uuid
        `,
        [adminId],
      );
    }

    await client.query(
      `
        update domains
        set status = 'DELETED', updated_at = now()
        where id = $1::uuid
      `,
      [id],
    );
  });
}

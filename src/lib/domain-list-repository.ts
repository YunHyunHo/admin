import { hashPassword } from "@/lib/password";
import { encryptVisiblePassword, getAllAdminAccounts } from "@/lib/admin-accounts";
import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";
import { getDomainManagementRows } from "@/lib/domain-management-repository";
import { getScopedDistributorCondition } from "@/lib/master-scope";
import type { SessionUser } from "@/lib/auth";

export type DomainListOwnerOption = {
  id: string;
  name: string;
};

export type DomainListRow = {
  id: string;
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
  balance: number;
  depositEnabled: boolean;
  createdAt: string;
};

type DomainCompanyAdminRow = {
  id: string;
  domain_name: string;
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
  return value.trim();
}

function isUuid(value: string | undefined) {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  );
}

export async function getDomainListBoardData(user: SessionUser) {
  const scope = getScopedDistributorCondition(user);
  const [rows, distributorOptions, detailedAccounts] = await Promise.all([
    getDomainManagementRows([], user),
    query<DomainListOwnerOption>(
      `
        select dist.id::text as id, dist.name
        from distributors dist
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where dist.status = 'ACTIVE'
          and dist.parent_distributor_id is not null
          ${scope.sql}
        order by dist.name asc
      `,
      scope.values,
    ),
    getAllAdminAccounts(user),
  ]);

  const domainAdminByCompany = new Map(
    detailedAccounts
      .filter((account) => account.role === "DOMAIN_ADMIN")
      .map((account) => [account.managedCompanies[0], account]),
  );

  const listRows: DomainListRow[] = rows.map((row) => {
    const domainAdmin = domainAdminByCompany.get(row.companyName);

    if (!domainAdmin) {
      return null;
    }

    return {
      id: row.id,
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
      balance: row.balance,
      depositEnabled: row.depositEnabled,
      createdAt: row.createdAt,
    };
  }).filter((row): row is DomainListRow => row !== null);

  return {
    rows: listRows,
    ownerOptions: distributorOptions.rows,
  };
}

export async function createDomainEntry(input: CreateDomainEntryInput) {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL 환경변수를 설정해주세요.");
  }

  if (!isUuid(input.ownerDistributorId)) {
    throw new Error("총판을 선택해주세요.");
  }

  const domainName = input.domainName.trim();
  const url = normalizeUrl(input.url);
  const loginId = input.loginId.trim();

  if (!domainName) {
    throw new Error("도메인 이름을 입력해주세요.");
  }

  if (!url) {
    throw new Error("URL을 입력해주세요.");
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
        select id::text
        from companies
        where company_name = $1
        limit 1
      `,
      [domainName],
    );

    if (duplicateCompany.rows[0]) {
      throw new Error("이미 사용 중인 도메인 이름입니다.");
    }

    const distributorResult = await client.query<{ id: string }>(
      `
        select id::text
        from distributors
        where id = $1::uuid
          and status = 'ACTIVE'
        limit 1
      `,
      [input.ownerDistributorId],
    );

    if (!distributorResult.rows[0]) {
      throw new Error("선택한 총판을 찾지 못했습니다.");
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
      [url, companyId, input.ownerDistributorId],
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

    await client.query(
      `
        insert into bank_accounts (
          company_id,
          distributor_id,
          bank_name,
          account_number,
          account_holder,
          is_active
        )
        values ($1::uuid, $2::uuid, $3, $4, $5, true)
      `,
      [
        companyId,
        input.ownerDistributorId,
        input.bankName.trim(),
        input.accountNumber.trim(),
        input.accountHolder.trim(),
      ],
    );
  });
}

export async function updateDomainEntryStatus(input: {
  id: string;
  depositEnabled: boolean;
}) {
  await query(
    `
      update domains
      set
        status = $2::admin_status,
        updated_at = now()
      where id = $1::uuid
    `,
    [input.id, input.depositEnabled ? "ACTIVE" : "SUSPENDED"],
  );
}

export async function updateDomainEntryAccount(input: {
  id: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
}) {
  if (!isUuid(input.id)) {
    throw new Error("도메인 정보를 확인해주세요.");
  }

  if (!input.bankName.trim() || !input.accountHolder.trim() || !input.accountNumber.trim()) {
    throw new Error("은행, 예금주, 계좌번호를 모두 입력해주세요.");
  }

  await withTransaction(async (client) => {
    const domainResult = await client.query<{
      company_id: string;
      distributor_id: string | null;
      account_id: string | null;
    }>(
      `
        select
          dom.company_id::text,
          dom.distributor_id::text,
          (
            select ba.id::text
            from bank_accounts ba
            where ba.company_id = dom.company_id
              and (ba.distributor_id = dom.distributor_id or ba.distributor_id is null)
            order by
              case when ba.distributor_id = dom.distributor_id then 0 else 1 end,
              ba.created_at desc
            limit 1
          ) as account_id
        from domains dom
        where dom.id = $1::uuid
          and dom.status <> 'DELETED'
        limit 1
      `,
      [input.id],
    );

    const domain = domainResult.rows[0];

    if (!domain?.company_id) {
      throw new Error("도메인 정보를 찾지 못했습니다.");
    }

    if (domain.account_id) {
      await client.query(
        `
          update bank_accounts
          set
            bank_name = $2,
            account_number = $3,
            account_holder = $4,
            is_active = true,
            updated_at = now()
          where id = $1::uuid
        `,
        [
          domain.account_id,
          input.bankName.trim(),
          input.accountNumber.trim(),
          input.accountHolder.trim(),
        ],
      );
      return;
    }

    await client.query(
      `
        insert into bank_accounts (
          company_id,
          distributor_id,
          bank_name,
          account_number,
          account_holder,
          is_active
        )
        values ($1::uuid, $2::uuid, $3, $4, $5, true)
      `,
      [
        domain.company_id,
        domain.distributor_id,
        input.bankName.trim(),
        input.accountNumber.trim(),
        input.accountHolder.trim(),
      ],
    );
  });
}

export async function deleteDomainEntry(id: string) {
  await deleteDomainEntryWithAccount(id, false);
}

async function deleteDomainEntryWithAccount(id: string, hardDelete: boolean) {
  if (!isUuid(id)) {
    throw new Error("도메인 정보를 확인해주세요.");
  }

  await withTransaction(async (client) => {
    const domainRow = await client.query<DomainCompanyAdminRow>(
      `
        select
          dom.id::text,
          dom.domain_name,
          c.company_name,
          dist.name as distributor_name,
          parent_dist.name as top_distributor_name,
          ba.bank_name,
          ba.account_number,
          ba.account_holder,
          dist.current_balance::text as current_balance,
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
          order by ba.created_at desc
          limit 1
        ) ba on true
        where dom.id = $1::uuid
        limit 1
      `,
      [id],
    );

    const companyName = domainRow.rows[0]?.company_name;

    if (!companyName) {
      throw new Error("도메인 정보를 찾지 못했습니다.");
    }

    const adminResult = await client.query<{ id: string }>(
      `
        select a.id::text
        from admins a
        join admin_company_mappings acm on acm.admin_id = a.id
        join companies c on c.id = acm.company_id
        where a.role = 'DOMAIN_ADMIN'
          and c.company_name = $1
        limit 1
      `,
      [companyName],
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
        `,
        [id],
      );
      await client.query(`delete from domains where id = $1::uuid`, [id]);
      await client.query(
        `
          delete from companies
          where company_name = $1
        `,
        [companyName],
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

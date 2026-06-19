import { cookies } from "next/headers";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";
import { formatKoreanDateTime, getKoreanNowStamp } from "@/lib/korean-time";
import { hashPassword } from "@/lib/password";
import type { SessionUser } from "@/lib/auth";

const ADMIN_ACCOUNTS_COOKIE = "vendor_admin_issued_accounts";

export type AdminRole =
  | "MASTER"
  | "TOP_DISTRIBUTOR"
  | "ADMIN"
  | "VIEWER"
  | "DOMAIN_ADMIN";
export type AdminStatus = "ACTIVE" | "SUSPENDED";

export type AdminAccountRecord = {
  id: string;
  loginId: string;
  password: string;
  visiblePassword: string;
  nickname: string;
  role: AdminRole;
  status: AdminStatus;
  companyId: string;
  companyName: string;
  apiLabel: string;
  managedCompanies: string[];
  hasDomainMapping?: boolean;
  createdBy: string | null;
  parentAdminId?: string | null;
  parentDistributorName?: string | null;
  currentBalance: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicAdminAccount = Omit<AdminAccountRecord, "password" | "visiblePassword">;

const managedCompanyOptions = ["전체"];

type DbAdminRow = {
  id: string;
  login_id: string;
  password_hash: string;
  password_ciphertext: string | null;
  name: string;
  role: AdminRole;
  status: AdminStatus | "DELETED";
  created_by: string | null;
  last_login_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  managed_companies: string[] | null;
  has_domain_mapping: boolean;
  parent_admin_id: string | null;
  parent_distributor_name: string | null;
  current_balance: string | null;
};

const hiddenPasswordMessage = "저장된 비밀번호를 확인할 수 없습니다.";

function getPasswordCipherKey() {
  const secret = process.env.SESSION_SECRET ?? process.env.MASTER_PASSWORD ?? "local-dev-secret";

  return createHash("sha256").update(secret).digest();
}

export function encryptVisiblePassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getPasswordCipherKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptVisiblePassword(value: string | null) {
  if (!value?.startsWith("v1:")) {
    return hiddenPasswordMessage;
  }

  try {
    const [, ivText, tagText, encryptedText] = value.split(":");

    if (!ivText || !tagText || !encryptedText) {
      return hiddenPasswordMessage;
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      getPasswordCipherKey(),
      Buffer.from(ivText, "base64url"),
    );

    decipher.setAuthTag(Buffer.from(tagText, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return hiddenPasswordMessage;
  }
}

export function normalizeManagedCompanies(
  companies: string[],
  allowedCompanies = managedCompanyOptions,
  options?: { allowEmpty?: boolean },
) {
  const normalized = companies.filter((company) =>
    allowedCompanies.includes(company),
  );

  if (normalized.length) {
    return normalized;
  }

  if (options?.allowEmpty) {
    return [];
  }

  return [allowedCompanies[0] ?? managedCompanyOptions[0]];
}

export function getNowStamp() {
  return getKoreanNowStamp();
}

function formatStamp(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return formatKoreanDateTime(value);
}

export function getMasterAccount(): AdminAccountRecord {
  return {
    id: "MASTER-ROOT",
    loginId: "master",
    password: process.env.MASTER_PASSWORD ?? "0000",
    visiblePassword: "-",
    nickname: "마스터 관리자",
    role: "MASTER",
    status: "ACTIVE",
    companyId: "master",
    companyName: "전체관리",
    apiLabel: "전체 API 관리",
    managedCompanies: managedCompanyOptions,
    createdBy: null,
    currentBalance: 0,
    lastLoginAt: null,
    createdAt: "05-03 00:00:00",
    updatedAt: "05-03 00:00:00",
  };
}

export async function getManagedCompanyOptions(
  user?: Pick<SessionUser, "id" | "role"> | null,
) {
  if (!hasDatabaseUrl()) {
    return managedCompanyOptions;
  }

  return getDbManagedCompanyOptions(user);
}

async function getDbManagedCompanyOptions(
  user?: Pick<SessionUser, "id" | "role"> | null,
) {
  if (user?.role === "MASTER") {
    const result = await query<{ company_name: string }>(
      `
        select distinct c.company_name
        from companies c
        join admin_company_mappings acm on acm.company_id = c.id
        join admins a on a.id = acm.admin_id
        where c.status = 'ACTIVE'
          and a.status <> 'DELETED'
          and a.created_by = $1::uuid
        order by c.company_name asc
      `,
      [user.id],
    );

    return result.rows.map((row) => row.company_name);
  }

  if (user?.role === "DOMAIN_ADMIN") {
    const result = await query<{ company_name: string }>(
      `
        select c.company_name
        from admin_company_mappings acm
        join companies c on c.id = acm.company_id
        where acm.admin_id = $1::uuid
          and c.status = 'ACTIVE'
        order by c.company_name asc
      `,
      [user.id],
    );

    return result.rows.map((row) => row.company_name);
  }

  const result = await query<{ company_name: string }>(
    `
      select company_name
      from companies
      where status = 'ACTIVE'
      order by company_name asc
    `,
  );

  return result.rows.length
    ? result.rows.map((row) => row.company_name)
    : managedCompanyOptions;
}

async function getDbAdminActor(adminId?: string | null) {
  if (!adminId) {
    return null;
  }

  const result = await query<{ id: string; role: SessionUser["role"] }>(
    `
      select id::text, role::text as role
      from admins
      where id = $1::uuid
        and status <> 'DELETED'
      limit 1
    `,
    [adminId],
  );

  return result.rows[0] ?? null;
}

async function getScopedCompanyIdsByNames(
  companyNames: string[],
  user?: Pick<SessionUser, "id" | "role"> | null,
) {
  if (!companyNames.length) {
    return [] as string[];
  }

  if (user?.role === "MASTER") {
    const result = await query<{ id: string; company_name: string }>(
      `
        select distinct c.id::text as id, c.company_name
        from companies c
        join admin_company_mappings acm on acm.company_id = c.id
        join admins a on a.id = acm.admin_id
        where c.status = 'ACTIVE'
          and c.company_name = any($1::text[])
          and a.status <> 'DELETED'
          and a.created_by = $2::uuid
        order by c.company_name asc
      `,
      [companyNames, user.id],
    );

    return result.rows.map((row) => row.id);
  }

  if (user?.role === "DOMAIN_ADMIN") {
    const result = await query<{ id: string; company_name: string }>(
      `
        select distinct c.id::text as id, c.company_name
        from companies c
        join admin_company_mappings acm on acm.company_id = c.id
        where c.status = 'ACTIVE'
          and c.company_name = any($1::text[])
          and acm.admin_id = $2::uuid
        order by c.company_name asc
      `,
      [companyNames, user.id],
    );

    return result.rows.map((row) => row.id);
  }

  const result = await query<{ id: string }>(
    `
      select id::text as id
      from companies
      where status = 'ACTIVE'
        and company_name = any($1::text[])
      order by company_name asc
    `,
    [companyNames],
  );

  return result.rows.map((row) => row.id);
}

function toAdminAccountRecord(
  row: DbAdminRow,
  companyOptions: string[],
): AdminAccountRecord | null {
  if (row.status === "DELETED") {
    return null;
  }

  const managedCompanySource = row.managed_companies?.length
    ? row.managed_companies
    : row.role === "DOMAIN_ADMIN"
      ? []
      : companyOptions;
  const managedCompanies = normalizeManagedCompanies(
    managedCompanySource,
    companyOptions,
    { allowEmpty: row.role === "DOMAIN_ADMIN" },
  );
  const isMaster = row.role === "MASTER";
  const companyName = isMaster
    ? "전체관리"
    : row.role === "DOMAIN_ADMIN"
      ? (managedCompanies[0] ?? "-")
      : `${managedCompanies.length}개 업체`;

  return {
    id: row.id,
    loginId: row.login_id,
    password: row.password_hash,
    visiblePassword: decryptVisiblePassword(row.password_ciphertext),
    nickname: row.name,
    role: row.role,
    status: row.status,
    companyId: isMaster
      ? "master"
      : row.role === "DOMAIN_ADMIN"
        ? (managedCompanies[0] ?? "-")
        : "multi",
    companyName,
    apiLabel:
      row.role === "DOMAIN_ADMIN"
        ? `${managedCompanies[0] ?? "미설정"} 연동 API`
        : "권한 범위 API",
    managedCompanies,
    hasDomainMapping: row.has_domain_mapping,
    createdBy: row.created_by,
    parentAdminId: row.parent_admin_id,
    parentDistributorName: row.parent_distributor_name,
    currentBalance: Number(row.current_balance ?? 0),
    lastLoginAt: formatStamp(row.last_login_at),
    createdAt: formatStamp(row.created_at) ?? getNowStamp(),
    updatedAt: formatStamp(row.updated_at) ?? getNowStamp(),
  };
}

function filterAccountsForUser(
  accounts: AdminAccountRecord[],
  user?: Pick<SessionUser, "id" | "role"> | null,
) {
  if (!user) {
    return accounts;
  }

  if (user.role !== "MASTER") {
    return accounts.filter((account) => account.id === user.id);
  }

  return accounts.filter((account) => account.id === user.id || account.createdBy === user.id);
}

async function getDbAdminAccounts(user?: Pick<SessionUser, "id" | "role"> | null) {
  const companyOptions = await getDbManagedCompanyOptions(user);
  const result = await query<DbAdminRow>(
    `
      select
        a.id::text,
        a.login_id,
        a.password_hash,
        a.password_ciphertext,
        a.name,
        a.role::text as role,
        a.status::text as status,
        a.created_by::text,
        a.last_login_at,
        a.created_at,
        a.updated_at,
        max(
          coalesce(
            parent_admin.id::text,
            owner_dist_admin.id::text
          )
        ) as parent_admin_id,
        max(
          coalesce(
            parent_dist.name,
            owner_dist.name
          )
        ) as parent_distributor_name,
        max(dist.current_balance)::text as current_balance,
        coalesce(
          array_remove(array_agg(c.company_name order by c.company_name), null),
          array[]::text[]
        ) as managed_companies,
        bool_or(adm.admin_id is not null) as has_domain_mapping
      from admins a
      left join distributors dist on dist.admin_id = a.id
      left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
      left join admins parent_admin on parent_admin.id = parent_dist.admin_id
      left join admin_domain_mappings adm on adm.admin_id = a.id
      left join domains owned_dom on owned_dom.id = adm.domain_id and owned_dom.status <> 'DELETED'
      left join distributors owner_dist on owner_dist.id = owned_dom.distributor_id
      left join admins owner_dist_admin on owner_dist_admin.id = owner_dist.admin_id
      left join admin_company_mappings acm on acm.admin_id = a.id
      left join companies c on c.id = acm.company_id
      where a.status <> 'DELETED'
      group by a.id
      order by
        case when a.role = 'MASTER' then 0 else 1 end,
        a.created_at desc
    `,
  );
  const accounts = result.rows
    .map((row) => toAdminAccountRecord(row, companyOptions))
    .filter((account): account is AdminAccountRecord => Boolean(account));

  const nextAccounts = accounts.some((account) => account.role === "MASTER")
    ? accounts
    : [getMasterAccount(), ...accounts];

  return filterAccountsForUser(nextAccounts, user);
}

function encodeAccounts(accounts: AdminAccountRecord[]) {
  return Buffer.from(JSON.stringify(accounts)).toString("base64url");
}

function decodeAccounts(value: string | undefined): AdminAccountRecord[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as AdminAccountRecord[];

    return Array.isArray(parsed)
      ? parsed.map((account) => ({
          ...account,
          managedCompanies: normalizeManagedCompanies(
            account.managedCompanies,
            managedCompanyOptions,
            { allowEmpty: account.role === "DOMAIN_ADMIN" },
          ),
        }))
      : [];
  } catch {
    return [];
  }
}

export async function getIssuedAdminAccountsFromCookie(
  user?: Pick<SessionUser, "id" | "role"> | null,
) {
  if (hasDatabaseUrl()) {
    const accounts = await getDbAdminAccounts(user);

    return accounts.filter((account) => account.role !== "MASTER");
  }

  const cookieStore = await cookies();

  return filterAccountsForUser(
    decodeAccounts(cookieStore.get(ADMIN_ACCOUNTS_COOKIE)?.value),
    user,
  );
}

export async function getAllAdminAccounts(user?: Pick<SessionUser, "id" | "role"> | null) {
  if (hasDatabaseUrl()) {
    return getDbAdminAccounts(user);
  }

  return [getMasterAccount(), ...(await getIssuedAdminAccountsFromCookie())];
}

export async function getPublicAdminAccounts(
  user?: Pick<SessionUser, "id" | "role"> | null,
) {
  const accounts = await getAllAdminAccounts(user);

  return accounts.map((account) => {
    const { password, visiblePassword, ...publicAccount } = account;
    void password;
    void visiblePassword;

    return publicAccount;
  });
}

export function setIssuedAdminAccountsCookie(
  response: Response & {
    cookies: {
      set: (
        name: string,
        value: string,
        options: {
          httpOnly: boolean;
          sameSite: "lax";
          secure: boolean;
          path: string;
        },
      ) => void;
    };
  },
  accounts: AdminAccountRecord[],
) {
  response.cookies.set(ADMIN_ACCOUNTS_COOKIE, encodeAccounts(accounts), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export function createIssuedAdminAccount(input: {
  loginId: string;
  password: string;
  nickname: string;
  role: AdminRole;
  managedCompanies: string[];
  createdBy: string;
  createdById?: string | null;
  parentAdminId?: string | null;
  parentDistributorName?: string | null;
}): AdminAccountRecord {
  const normalizedCompanies = normalizeManagedCompanies(input.managedCompanies);
  const domainManagedCompanies =
    input.role === "DOMAIN_ADMIN"
      ? normalizeManagedCompanies(input.managedCompanies, managedCompanyOptions, {
          allowEmpty: true,
        })
      : normalizedCompanies;
  const companyName =
    input.role === "DOMAIN_ADMIN"
      ? (domainManagedCompanies[0] ?? "-")
      : `${normalizedCompanies.length}개 업체`;
  const now = getNowStamp();

  return {
    id: `ADM-${Date.now().toString(36).toUpperCase()}`,
    loginId: input.loginId,
    password: input.password,
    visiblePassword: input.password,
    nickname: input.nickname,
    role: input.role,
    status: "ACTIVE",
    companyId: input.role === "DOMAIN_ADMIN" ? (domainManagedCompanies[0] ?? "-") : "multi",
    companyName,
    apiLabel:
      input.role === "DOMAIN_ADMIN"
        ? `${domainManagedCompanies[0] ?? "미설정"} 연동 API`
        : "권한 범위 API",
    managedCompanies: input.role === "DOMAIN_ADMIN" ? domainManagedCompanies : normalizedCompanies,
    hasDomainMapping: false,
    createdBy: input.role === "MASTER" ? null : input.createdBy,
    parentAdminId: input.parentAdminId ?? null,
    parentDistributorName: input.parentDistributorName ?? null,
    currentBalance: 0,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createPersistedAdminAccount(input: {
  loginId: string;
  password: string;
  nickname: string;
  role: AdminRole;
  managedCompanies: string[];
  createdBy: string;
  createdById?: string | null;
  parentAdminId?: string | null;
}) {
  if (!hasDatabaseUrl()) {
    return createIssuedAdminAccount(input);
  }

  const ownerScope = await getDbAdminActor(input.createdById);
  const companyOptions = await getDbManagedCompanyOptions(ownerScope);
  const normalizedCompanies =
    input.role === "DOMAIN_ADMIN"
      ? normalizeManagedCompanies(input.managedCompanies, companyOptions, {
          allowEmpty: true,
        })
      : normalizeManagedCompanies(input.managedCompanies, companyOptions);
  const passwordHash = await hashPassword(input.password);
  const encryptedPassword = encryptVisiblePassword(input.password);
  const result = await query<{ id: string }>(
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
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        'ACTIVE',
        $6::uuid
      )
      returning id::text
    `,
    [
      input.loginId,
      passwordHash,
      encryptedPassword,
      input.nickname,
      input.role,
      input.role === "MASTER" ? null : input.createdById ?? null,
    ],
  );
  const adminId = result.rows[0]?.id;

  if (!adminId) {
    throw new Error("어드민 계정 생성에 실패했습니다.");
  }

  const scopedCompanyIds = await getScopedCompanyIdsByNames(
    normalizedCompanies,
    ownerScope,
  );
  let primaryCompanyId = scopedCompanyIds[0] ?? null;

  if (!primaryCompanyId && normalizedCompanies.length) {
    const createdCompany = await query<{ id: string }>(
      `
        insert into companies (company_name, status)
        values ($1, 'ACTIVE')
        returning id::text
      `,
      [normalizedCompanies[0]],
    );
    primaryCompanyId = createdCompany.rows[0]?.id ?? null;
    if (primaryCompanyId) {
      scopedCompanyIds.push(primaryCompanyId);
    }
  }

  if (normalizedCompanies.length) {
    await query(
      `
        insert into admin_company_mappings (admin_id, company_id)
        select $1::uuid, unnest($2::uuid[])
        on conflict (admin_id, company_id) do nothing
      `,
      [adminId, scopedCompanyIds],
    );
  }

  if (primaryCompanyId && input.role !== "MASTER") {
    let parentDistributorId: string | null = null;

    if (input.role === "ADMIN" && input.parentAdminId) {
      const parentResult = await query<{ distributor_id: string }>(
        `
          select dist.id::text as distributor_id
          from distributors dist
          join admins a on a.id = dist.admin_id
          where a.id = $1::uuid
            and a.role = 'TOP_DISTRIBUTOR'
            and a.created_by = $2::uuid
          limit 1
        `,
        [input.parentAdminId, input.createdById ?? null],
      );

      parentDistributorId = parentResult.rows[0]?.distributor_id ?? null;

      if (!parentDistributorId) {
        throw new Error("연결할 상위총판을 찾지 못했습니다.");
      }
    }

    await query(
      `
        update distributors
        set
          company_id = $1::uuid,
          parent_distributor_id = $4::uuid,
          name = $3,
          level = $5,
          status = 'ACTIVE',
          updated_at = now()
        where admin_id = $2::uuid
      `,
      [
        primaryCompanyId,
        adminId,
        input.nickname,
        parentDistributorId,
        input.role === "TOP_DISTRIBUTOR" ? "TOP_DISTRIBUTOR" : "DISTRIBUTOR",
      ],
    );
    await query(
      `
        insert into distributors (
          company_id,
          admin_id,
          parent_distributor_id,
          name,
          level,
          current_balance,
          status
        )
        select $1::uuid, $2::uuid, $3::uuid, $4, $5, 0, 'ACTIVE'
        where not exists (
          select 1
          from distributors
          where admin_id = $2::uuid
        )
      `,
      [
        primaryCompanyId,
        adminId,
        parentDistributorId,
        input.nickname,
        input.role === "TOP_DISTRIBUTOR" ? "TOP_DISTRIBUTOR" : "DISTRIBUTOR",
      ],
    );
  }

  return (await getAllAdminAccounts(ownerScope)).find((account) => account.id === adminId);
}

export async function updatePersistedAdminAccount(input: {
  id: string;
  action: "toggle-status" | "delete" | "hard-delete" | "set-companies" | "adjust-balance";
  managedCompanies?: string[];
  balanceAmount?: number;
  balanceDirection?: "increase" | "decrease";
  processedBy?: string;
}) {
  if (!hasDatabaseUrl()) {
    return null;
  }

  const actor = await getDbAdminActor(input.processedBy);
  const accounts = await getAllAdminAccounts(actor);
  const targetAccount = accounts.find((account) => account.id === input.id);

  if (!targetAccount) {
    throw new Error("수정할 하부계정을 찾을 수 없습니다.");
  }

  if (input.action === "adjust-balance") {
    const amount = Number(input.balanceAmount);

    if (
      (targetAccount.role !== "TOP_DISTRIBUTOR" && targetAccount.role !== "ADMIN") ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      (input.balanceDirection !== "increase" && input.balanceDirection !== "decrease") ||
      !input.processedBy
    ) {
      throw new Error("조정할 총판 보유금 정보를 확인해주세요.");
    }

    await withTransaction(async (client) => {
      const distributorResult = await client.query<{
        id: string;
        current_balance: string;
      }>(
        `
          select id::text, current_balance::text
          from distributors
          where admin_id = $1::uuid
            and status <> 'DELETED'
          for update
        `,
        [input.id],
      );
      const distributor = distributorResult.rows[0];

      if (!distributor) {
        throw new Error("보유금을 조정할 총판 정보를 찾지 못했습니다.");
      }

      const signedAmount = input.balanceDirection === "decrease" ? -amount : amount;
      const beforeBalance = Number(distributor.current_balance);
      const afterBalance = beforeBalance + signedAmount;

      if (afterBalance < 0) {
        throw new Error("현재 보유금보다 큰 금액은 감소할 수 없습니다.");
      }

      await client.query(
        `
          update distributors
          set current_balance = $2,
              updated_at = now()
          where id = $1::uuid
        `,
        [distributor.id, afterBalance],
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
          values (
            $1::uuid,
            $2,
            $3,
            $4,
            'DISTRIBUTOR_BALANCE_ADJUSTMENT',
            gen_random_uuid(),
            $5,
            $6::uuid
          )
        `,
        [
          distributor.id,
          signedAmount,
          beforeBalance,
          afterBalance,
          input.balanceDirection === "increase" ? "총판 보유금 추가" : "총판 보유금 감소",
          input.processedBy,
        ],
      );
    });

    return (await getAllAdminAccounts()).find((account) => account.id === input.id);
  }

  if (input.action === "delete") {
    const distributorRows = await query<{ id: string }>(
      `
        select id::text
        from distributors
        where admin_id = $1::uuid
      `,
      [input.id],
    );
    const distributorIds = distributorRows.rows.map((row) => row.id);

    if (targetAccount.role === "TOP_DISTRIBUTOR") {
      await query(
        `
          update distributors
          set parent_distributor_id = null, updated_at = now()
          where parent_distributor_id in (
            select id
            from distributors
            where admin_id = $1::uuid
          )
        `,
        [input.id],
      );
    }

    if (distributorIds.length) {
      await query(
        `
          update fee_rates
          set ends_at = now(), updated_at = now()
          where ends_at is null
            and (
              distributor_id = any($1::uuid[])
              or sub_distributor_id = any($1::uuid[])
              or exists (
                select 1
                from fee_rate_partners fp
                where fp.fee_rate_id = fee_rates.id
                  and fp.distributor_id = any($1::uuid[])
              )
            )
        `,
        [distributorIds],
      );
    }

    await query(
      `
        update admins
        set status = 'DELETED', updated_at = now()
        where id = $1::uuid and role <> 'MASTER'
      `,
        [input.id],
      );
    await query(
      `
        update distributors
        set status = 'DELETED', updated_at = now()
        where admin_id = $1::uuid
      `,
      [input.id],
    );
  }

  if (input.action === "hard-delete") {
    await withTransaction(async (client) => {
      const distributorRows = await client.query<{ id: string }>(
        `
          select id::text
          from distributors
          where admin_id = $1::uuid
        `,
        [input.id],
      );
      const distributorIds = distributorRows.rows.map((row) => row.id);

      const domainRows = distributorIds.length
        ? await client.query<{ id: string }>(
            `
              select id::text
              from domains
              where distributor_id = any($1::uuid[])
            `,
            [distributorIds],
          )
        : { rows: [] as { id: string }[] };
      const domainIds = domainRows.rows.map((row) => row.id);

      const chargeRows =
        distributorIds.length || domainIds.length
          ? await client.query<{ id: string }>(
              `
                select id::text
                from charge_requests
                where distributor_id = any($1::uuid[])
                  or domain_id = any($2::uuid[])
              `,
              [distributorIds, domainIds],
            )
          : { rows: [] as { id: string }[] };
      const chargeIds = chargeRows.rows.map((row) => row.id);

      if (distributorIds.length) {
        await client.query(
          `
            update distributors
            set parent_distributor_id = null, updated_at = now()
            where parent_distributor_id = any($1::uuid[])
          `,
          [distributorIds],
        );
      }

      await client.query(`delete from admin_audit_logs where admin_id = $1::uuid`, [input.id]);
      await client.query(
        `delete from admin_domain_mappings where admin_id = $1::uuid`,
        [input.id],
      );
      await client.query(
        `delete from admin_company_mappings where admin_id = $1::uuid`,
        [input.id],
      );

      if (chargeIds.length || distributorIds.length || domainIds.length) {
        await client.query(
          `
            delete from commission_records
            where charge_request_id = any($1::uuid[])
              or distributor_id = any($2::uuid[])
              or domain_id = any($3::uuid[])
          `,
          [chargeIds, distributorIds, domainIds],
        );
      }

      if (distributorIds.length) {
        await client.query(
          `delete from distributor_balance_transactions where distributor_id = any($1::uuid[])`,
          [distributorIds],
        );
        await client.query(
          `delete from distributor_withdrawals where distributor_id = any($1::uuid[])`,
          [distributorIds],
        );
        await client.query(
          `delete from distributor_settlements where distributor_id = any($1::uuid[])`,
          [distributorIds],
        );
        await client.query(`delete from bank_accounts where distributor_id = any($1::uuid[])`, [
          distributorIds,
        ]);
      }

      if (domainIds.length) {
        await client.query(
          `delete from domain_settlements where domain_id = any($1::uuid[])`,
          [domainIds],
        );
        await client.query(
          `delete from exchange_requests where domain_id = any($1::uuid[])`,
          [domainIds],
        );
      }

      if (chargeIds.length) {
        await client.query(`delete from charge_requests where id = any($1::uuid[])`, [chargeIds]);
      }

      if (domainIds.length || distributorIds.length || input.id) {
        await client.query(
          `
            delete from fee_rates
            where created_by = $1::uuid
              or distributor_id = any($2::uuid[])
              or sub_distributor_id = any($2::uuid[])
              or domain_id = any($3::uuid[])
              or exists (
                select 1
                from fee_rate_partners fp
                where fp.fee_rate_id = fee_rates.id
                  and fp.distributor_id = any($2::uuid[])
              )
          `,
          [input.id, distributorIds, domainIds],
        );
      }

      if (domainIds.length) {
        await client.query(`delete from domains where id = any($1::uuid[])`, [domainIds]);
      }

      if (distributorIds.length) {
        await client.query(`delete from distributors where id = any($1::uuid[])`, [distributorIds]);
      }

      await client.query(
        `
          delete from admins
          where id = $1::uuid and role <> 'MASTER'
        `,
        [input.id],
      );
    });
  }

  if (input.action === "toggle-status") {
    await query(
      `
        update admins
        set
          status = case when status = 'ACTIVE' then 'SUSPENDED'::admin_status else 'ACTIVE'::admin_status end,
          updated_at = now()
        where id = $1::uuid and role <> 'MASTER'
      `,
        [input.id],
      );
    await query(
      `
        update distributors
        set
          status = case when status = 'ACTIVE' then 'SUSPENDED'::admin_status else 'ACTIVE'::admin_status end,
          updated_at = now()
        where admin_id = $1::uuid
      `,
      [input.id],
    );
  }

  if (input.action === "set-companies") {
    const companyOptions = await getDbManagedCompanyOptions(actor);
    const managedCompanies = normalizeManagedCompanies(
      input.managedCompanies ?? [],
      companyOptions,
      { allowEmpty: true },
    );
    const scopedCompanyIds = await getScopedCompanyIdsByNames(
      managedCompanies,
      actor,
    );

    await query("delete from admin_company_mappings where admin_id = $1::uuid", [
      input.id,
    ]);
    await query(
      `
        insert into admin_company_mappings (admin_id, company_id)
        select $1::uuid, unnest($2::uuid[])
        on conflict (admin_id, company_id) do nothing
      `,
      [input.id, scopedCompanyIds],
    );
  }

  return targetAccount;
}

export async function recordAdminLogin(loginId: string) {
  if (!hasDatabaseUrl()) {
    return;
  }

  await query(
    `
      update admins
      set last_login_at = now(), updated_at = now()
      where login_id = $1 and status = 'ACTIVE'
    `,
    [loginId],
  );
}

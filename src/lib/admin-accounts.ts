import { cookies } from "next/headers";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { hasDatabaseUrl, query } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import type { SessionUser } from "@/lib/auth";

const ADMIN_ACCOUNTS_COOKIE = "vendor_admin_issued_accounts";

export type AdminRole = "MASTER" | "ADMIN" | "VIEWER" | "DOMAIN_ADMIN";
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
  createdBy: string | null;
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
};

const hiddenPasswordMessage = "저장된 비밀번호를 확인할 수 없습니다.";

function getPasswordCipherKey() {
  const secret = process.env.SESSION_SECRET ?? process.env.MASTER_PASSWORD ?? "local-dev-secret";

  return createHash("sha256").update(secret).digest();
}

function encryptVisiblePassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getPasswordCipherKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptVisiblePassword(value: string | null) {
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
) {
  const normalized = companies.filter((company) =>
    allowedCompanies.includes(company),
  );

  return normalized.length ? normalized : [allowedCompanies[0] ?? managedCompanyOptions[0]];
}

export function getNowStamp() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${month}-${date} ${hours}:${minutes}:${seconds}`;
}

function formatStamp(value: Date | string | null) {
  if (!value) {
    return null;
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
    lastLoginAt: null,
    createdAt: "05-03 00:00:00",
    updatedAt: "05-03 00:00:00",
  };
}

export async function getManagedCompanyOptions() {
  if (!hasDatabaseUrl()) {
    return managedCompanyOptions;
  }

  return getDbManagedCompanyOptions();
}

async function getDbManagedCompanyOptions() {
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

function toAdminAccountRecord(
  row: DbAdminRow,
  companyOptions: string[],
): AdminAccountRecord | null {
  if (row.status === "DELETED") {
    return null;
  }

  const managedCompanies = normalizeManagedCompanies(
    row.managed_companies?.length ? row.managed_companies : companyOptions,
    companyOptions,
  );
  const isMaster = row.role === "MASTER";
  const companyName = isMaster
    ? "전체관리"
    : row.role === "DOMAIN_ADMIN"
      ? managedCompanies[0]
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
        ? managedCompanies[0]
        : "multi",
    companyName,
    apiLabel:
      row.role === "DOMAIN_ADMIN" ? `${managedCompanies[0]} 연동 API` : "권한 범위 API",
    managedCompanies,
    createdBy: row.created_by,
    lastLoginAt: formatStamp(row.last_login_at),
    createdAt: formatStamp(row.created_at) ?? getNowStamp(),
    updatedAt: formatStamp(row.updated_at) ?? getNowStamp(),
  };
}

function filterAccountsForUser(
  accounts: AdminAccountRecord[],
  user?: Pick<SessionUser, "id" | "role"> | null,
) {
  if (!user || user.role !== "MASTER") {
    return accounts;
  }

  return accounts.filter(
    (account) => account.id === user.id || account.createdBy === user.id,
  );
}

async function getDbAdminAccounts(user?: Pick<SessionUser, "id" | "role"> | null) {
  const companyOptions = await getDbManagedCompanyOptions();
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
        coalesce(
          array_remove(array_agg(c.company_name order by c.company_name), null),
          array[]::text[]
        ) as managed_companies
      from admins a
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
          managedCompanies: normalizeManagedCompanies(account.managedCompanies),
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

  return decodeAccounts(cookieStore.get(ADMIN_ACCOUNTS_COOKIE)?.value);
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
}): AdminAccountRecord {
  const normalizedCompanies = normalizeManagedCompanies(input.managedCompanies);
  const companyName =
    input.role === "DOMAIN_ADMIN"
      ? normalizedCompanies[0]
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
    companyId: input.role === "DOMAIN_ADMIN" ? normalizedCompanies[0] : "multi",
    companyName,
    apiLabel:
      input.role === "DOMAIN_ADMIN"
        ? `${normalizedCompanies[0]} 연동 API`
        : "권한 범위 API",
    managedCompanies: normalizedCompanies,
    createdBy: input.role === "MASTER" ? null : input.createdBy,
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
}) {
  if (!hasDatabaseUrl()) {
    return createIssuedAdminAccount(input);
  }

  const companyOptions = await getDbManagedCompanyOptions();
  const normalizedCompanies = normalizeManagedCompanies(
    input.managedCompanies,
    companyOptions,
  );
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

  const companyIdResult = await query<{ id: string }>(
    `
      select id::text
      from companies
      where company_name = any($1::text[])
      order by company_name asc
      limit 1
    `,
    [normalizedCompanies],
  );
  const primaryCompanyId = companyIdResult.rows[0]?.id;

  await query(
    `
      insert into admin_company_mappings (admin_id, company_id)
      select $1::uuid, id
      from companies
      where company_name = any($2::text[])
      on conflict (admin_id, company_id) do nothing
    `,
    [adminId, normalizedCompanies],
  );

  if (primaryCompanyId && input.role !== "MASTER") {
    await query(
      `
        update distributors
        set
          company_id = $1::uuid,
          name = $3,
          status = 'ACTIVE',
          updated_at = now()
        where admin_id = $2::uuid
      `,
      [primaryCompanyId, adminId, input.nickname],
    );
    await query(
      `
        insert into distributors (
          company_id,
          admin_id,
          name,
          level,
          current_balance,
          status
        )
        select $1::uuid, $2::uuid, $3, 'DISTRIBUTOR', 0, 'ACTIVE'
        where not exists (
          select 1
          from distributors
          where admin_id = $2::uuid
        )
      `,
      [primaryCompanyId, adminId, input.nickname],
    );
  }

  return (await getAllAdminAccounts()).find((account) => account.id === adminId);
}

export async function updatePersistedAdminAccount(input: {
  id: string;
  action: "toggle-status" | "delete" | "set-companies";
  managedCompanies?: string[];
}) {
  if (!hasDatabaseUrl()) {
    return null;
  }

  const accounts = await getIssuedAdminAccountsFromCookie();
  const targetAccount = accounts.find((account) => account.id === input.id);

  if (!targetAccount) {
    return null;
  }

  if (input.action === "delete") {
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
    const companyOptions = await getDbManagedCompanyOptions();
    const managedCompanies = normalizeManagedCompanies(
      input.managedCompanies ?? [],
      companyOptions,
    );

    await query("delete from admin_company_mappings where admin_id = $1::uuid", [
      input.id,
    ]);
    await query(
      `
        insert into admin_company_mappings (admin_id, company_id)
        select $1::uuid, id
        from companies
        where company_name = any($2::text[])
        on conflict (admin_id, company_id) do nothing
      `,
      [input.id, managedCompanies],
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

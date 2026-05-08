import { cookies } from "next/headers";

const ADMIN_ACCOUNTS_COOKIE = "vendor_admin_issued_accounts";

export type AdminRole = "MASTER" | "ADMIN" | "VIEWER" | "DOMAIN_ADMIN";
export type AdminStatus = "ACTIVE" | "SUSPENDED";

export type AdminAccountRecord = {
  id: string;
  loginId: string;
  password: string;
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

export type PublicAdminAccount = Omit<AdminAccountRecord, "password">;

const managedCompanyOptions = ["원페이"];

export function normalizeManagedCompanies(companies: string[]) {
  const normalized = companies.filter((company) =>
    managedCompanyOptions.includes(company),
  );

  return normalized.length ? normalized : [managedCompanyOptions[0]];
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

export function getMasterAccount(): AdminAccountRecord {
  return {
    id: "MASTER-ROOT",
    loginId: "master",
    password: process.env.MASTER_PASSWORD ?? "0000",
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

export function getManagedCompanyOptions() {
  return managedCompanyOptions;
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

export async function getIssuedAdminAccountsFromCookie() {
  const cookieStore = await cookies();

  return decodeAccounts(cookieStore.get(ADMIN_ACCOUNTS_COOKIE)?.value);
}

export async function getAllAdminAccounts() {
  return [getMasterAccount(), ...(await getIssuedAdminAccountsFromCookie())];
}

export async function getPublicAdminAccounts() {
  const accounts = await getAllAdminAccounts();

  return accounts.map((account) => {
    const { password, ...publicAccount } = account;
    void password;

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
    createdBy: input.createdBy,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

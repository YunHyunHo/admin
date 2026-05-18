import { NextResponse } from "next/server";

import {
  createIssuedAdminAccount,
  createPersistedAdminAccount,
  getAllAdminAccounts,
  getIssuedAdminAccountsFromCookie,
  getManagedCompanyOptions,
  getNowStamp,
  getPublicAdminAccounts,
  normalizeManagedCompanies,
  setIssuedAdminAccountsCookie,
  updatePersistedAdminAccount,
  type AdminAccountRecord,
  type AdminRole,
} from "@/lib/admin-accounts";
import { getSessionUser } from "@/lib/auth";
import { hasDatabaseUrl } from "@/lib/db";

export const runtime = "nodejs";

type CreateAdminPayload = {
  loginId?: string;
  password?: string;
  nickname?: string;
  role?: AdminRole;
  managedCompanies?: string[];
  parentAdminId?: string;
  parentDistributorName?: string;
};

type PatchAdminPayload = {
  id?: string;
  action?: "toggle-status" | "delete" | "set-companies";
  managedCompanies?: string[];
};

function isWritableRole(role: string | undefined) {
  return role === "MASTER";
}

function toPublicList(accounts: AdminAccountRecord[]) {
  return accounts.map((account) => {
    const { password, visiblePassword, ...publicAccount } = account;
    void password;
    void visiblePassword;

    return publicAccount;
  });
}

function isAdminRole(value: string | undefined): value is AdminRole {
  return (
    value === "MASTER" ||
    value === "TOP_DISTRIBUTOR" ||
    value === "ADMIN" ||
    value === "VIEWER" ||
    value === "DOMAIN_ADMIN"
  );
}

export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }

    return NextResponse.json({
      accounts: await getPublicAdminAccounts(user),
      detailedAccounts: isWritableRole(user.role) ? await getAllAdminAccounts(user) : [],
      managedCompanies: await getManagedCompanyOptions(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "어드민 목록을 불러오지 못했습니다.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();

    if (!user || !isWritableRole(user.role)) {
      return NextResponse.json(
        { message: "하위 계정을 생성할 권한이 없습니다." },
        { status: 403 },
      );
    }

    const payload = (await request.json()) as CreateAdminPayload;
    const loginId = payload.loginId?.trim() ?? "";
    const password = payload.password ?? "";
    const nickname = payload.nickname?.trim() ?? "";
    const role = payload.role;
    const parentAdminId = payload.parentAdminId?.trim() ?? "";
    const parentDistributorName = payload.parentDistributorName?.trim() ?? "";
    const managedCompanyOptions = await getManagedCompanyOptions();
    const managedCompanies =
      payload.managedCompanies?.filter((company) =>
        managedCompanyOptions.includes(company),
      ) ?? [];

    if (!isAdminRole(role)) {
      return NextResponse.json(
        { message: "생성할 계정 권한을 선택해주세요." },
        { status: 400 },
      );
    }

    if (!/^[A-Za-z][A-Za-z0-9_]{3,}$/.test(loginId)) {
      return NextResponse.json(
        { message: "아이디는 영문 시작, 4글자 이상이어야 합니다." },
        { status: 400 },
      );
    }

    if (nickname.length < 2) {
      return NextResponse.json(
        { message: "닉네임은 2글자 이상 입력해주세요." },
        { status: 400 },
      );
    }

    if (!/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(password)) {
      return NextResponse.json(
        { message: "비밀번호는 6글자 이상, 영문과 숫자를 포함해야 합니다." },
        { status: 400 },
      );
    }

    if (role === "ADMIN" && !parentAdminId && hasDatabaseUrl()) {
      return NextResponse.json(
        { message: "총판에 연결할 상위총판을 선택해주세요." },
        { status: 400 },
      );
    }

    const issuedAccounts = await getIssuedAdminAccountsFromCookie(user);
    const allAccounts = await getAllAdminAccounts();

    if (allAccounts.some((account) => account.loginId === loginId)) {
      return NextResponse.json(
        { message: "이미 사용 중인 아이디입니다." },
        { status: 409 },
      );
    }

    if (hasDatabaseUrl()) {
      await createPersistedAdminAccount({
        loginId,
        password,
        nickname,
        role,
        managedCompanies,
        createdBy: user.loginId,
        createdById: user.id,
        parentAdminId: parentAdminId || undefined,
      });

      return NextResponse.json({
        accounts: await getPublicAdminAccounts(user),
        detailedAccounts: await getAllAdminAccounts(user),
        managedCompanies: managedCompanyOptions,
        message: `${loginId} 계정이 생성되었습니다.`,
      });
    }

    const nextAccounts = [
      createIssuedAdminAccount({
        loginId,
        password,
        nickname,
        role,
        managedCompanies,
        createdBy: user.loginId,
        createdById: user.id,
        parentAdminId: parentAdminId || undefined,
        parentDistributorName: parentDistributorName || undefined,
      }),
      ...issuedAccounts,
    ];
    const response = NextResponse.json({
      accounts: toPublicList([allAccounts[0], ...nextAccounts]),
      detailedAccounts: [allAccounts[0], ...nextAccounts],
      managedCompanies: managedCompanyOptions,
      message: `${loginId} 계정이 생성되었습니다.`,
    });

    setIssuedAdminAccountsCookie(response, nextAccounts);

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "하부계정 생성 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();

  if (!user || !isWritableRole(user.role)) {
    return NextResponse.json(
      { message: "하위 계정을 수정할 권한이 없습니다." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as PatchAdminPayload;

  if (!payload.id || !payload.action) {
    return NextResponse.json(
      { message: "수정할 계정 정보가 없습니다." },
      { status: 400 },
    );
  }

  const issuedAccounts = await getIssuedAdminAccountsFromCookie(user);
  const targetAccount = issuedAccounts.find((account) => account.id === payload.id);

  if (!targetAccount) {
    return NextResponse.json(
      { message: "수정할 하부계정을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  if (targetAccount.role === "MASTER") {
    return NextResponse.json(
      { message: "마스터 계정은 수정할 수 없습니다." },
      { status: 400 },
    );
  }

  if (hasDatabaseUrl()) {
    await updatePersistedAdminAccount({
      id: payload.id,
      action: payload.action,
      managedCompanies: payload.managedCompanies,
    });

    return NextResponse.json({
      accounts: await getPublicAdminAccounts(user),
      detailedAccounts: await getAllAdminAccounts(user),
      managedCompanies: await getManagedCompanyOptions(),
      message:
        payload.action === "delete"
          ? `${targetAccount.loginId} 계정이 삭제되었습니다.`
          : payload.action === "toggle-status"
            ? targetAccount.status === "ACTIVE"
              ? `${targetAccount.loginId} 계정을 사용중지했습니다.`
              : `${targetAccount.loginId} 계정을 다시 사용 상태로 변경했습니다.`
            : `${targetAccount.loginId} 계정의 관리업체를 수정했습니다.`,
    });
  }

  let nextAccounts = issuedAccounts;
  let message = "하부계정 정보가 수정되었습니다.";

  if (payload.action === "delete") {
    nextAccounts = issuedAccounts.filter((account) => account.id !== payload.id);
    message = `${targetAccount.loginId} 계정이 삭제되었습니다.`;
  }

  if (payload.action === "toggle-status") {
    nextAccounts = issuedAccounts.map((account) =>
      account.id === payload.id
        ? {
            ...account,
            status: account.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
            updatedAt: getNowStamp(),
          }
        : account,
    );
    message =
      targetAccount.status === "ACTIVE"
        ? `${targetAccount.loginId} 계정을 사용중지했습니다.`
        : `${targetAccount.loginId} 계정을 다시 사용 상태로 변경했습니다.`;
  }

  if (payload.action === "set-companies") {
    const managedCompanies = normalizeManagedCompanies(
      payload.managedCompanies ?? [],
    );

    nextAccounts = issuedAccounts.map((account) =>
      account.id === payload.id
        ? {
            ...account,
            companyName:
              account.role === "DOMAIN_ADMIN"
                ? managedCompanies[0] ?? account.companyName
                : `${managedCompanies.length}개 업체`,
            companyId:
              account.role === "DOMAIN_ADMIN"
                ? managedCompanies[0] ?? account.companyId
                : "multi",
            apiLabel:
              account.role === "DOMAIN_ADMIN"
                ? `${managedCompanies[0] ?? account.companyName} 연동 API`
                : "권한 범위 API",
            managedCompanies,
            updatedAt: getNowStamp(),
          }
        : account,
    );
    message = `${targetAccount.loginId} 계정의 관리업체를 수정했습니다.`;
  }

  const response = NextResponse.json({
    accounts: toPublicList([...(await getAllAdminAccounts(user)).slice(0, 1), ...nextAccounts]),
    managedCompanies: await getManagedCompanyOptions(),
    message,
  });

  setIssuedAdminAccountsCookie(response, nextAccounts);

  return response;
}

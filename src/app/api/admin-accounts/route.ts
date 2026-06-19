import { NextResponse } from "next/server";

import {
  createIssuedAdminAccount,
  createPersistedAdminAccount,
  getAllAdminAccounts,
  getIssuedAdminAccountsFromCookie,
  getManagedCompanyOptions,
  getNowStamp,
  normalizeManagedCompanies,
  setIssuedAdminAccountsCookie,
  updatePersistedAdminAccount,
  type AdminAccountRecord,
  type AdminRole,
} from "@/lib/admin-accounts";
import { getSessionUser } from "@/lib/auth";
import { hasDatabaseUrl, query } from "@/lib/db";

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
  action?: "toggle-status" | "delete" | "hard-delete" | "set-companies" | "adjust-balance";
  managedCompanies?: string[];
  balanceAmount?: number;
  balanceDirection?: "increase" | "decrease";
};

function isWritableRole(role: string | undefined) {
  return role === "MASTER" || role === "DOMAIN_ADMIN";
}

function isPatchAction(value: string | undefined): value is NonNullable<PatchAdminPayload["action"]> {
  return (
    value === "toggle-status" ||
    value === "delete" ||
    value === "hard-delete" ||
    value === "set-companies" ||
    value === "adjust-balance"
  );
}

function toPublicList(accounts: AdminAccountRecord[]) {
  return accounts.map((account) => {
    const { password, visiblePassword, ...publicAccount } = account;
    void password;
    void visiblePassword;

    return publicAccount;
  });
}

function toVisiblePasswordList(accounts: AdminAccountRecord[]) {
  return accounts.map((account) => {
    const { password, ...visibleAccount } = account;
    void password;

    return visibleAccount;
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

    const [allAccounts, managedCompanies] = await Promise.all([
      getAllAdminAccounts(user),
      getManagedCompanyOptions(user),
    ]);

    return NextResponse.json({
      accounts: isWritableRole(user.role)
        ? toVisiblePasswordList(allAccounts)
        : toPublicList(allAccounts),
      detailedAccounts: isWritableRole(user.role) ? allAccounts : [],
      managedCompanies,
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
    const managedCompanyOptions = await getManagedCompanyOptions(user);
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

    if (password.trim().length < 4) {
      return NextResponse.json(
        { message: "비밀번호는 4글자 이상 입력해주세요." },
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
      const duplicateAdmin = await query<{ id: string }>(
        `
          select id::text
          from admins
          where login_id = $1
          limit 1
        `,
        [loginId],
      );

      if (duplicateAdmin.rows[0]) {
        return NextResponse.json(
          { message: "이미 사용 중인 아이디입니다." },
          { status: 409 },
        );
      }

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

      const updatedAccounts = await getAllAdminAccounts(user);

      return NextResponse.json({
        accounts: toVisiblePasswordList(updatedAccounts),
        detailedAccounts: updatedAccounts,
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
      accounts: toVisiblePasswordList([allAccounts[0], ...nextAccounts]),
      detailedAccounts: [allAccounts[0], ...nextAccounts],
      managedCompanies: managedCompanyOptions,
      message: `${loginId} 계정이 생성되었습니다.`,
    });

    setIssuedAdminAccountsCookie(response, nextAccounts);

    return response;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { message: "이미 사용 중인 아이디입니다." },
        { status: 409 },
      );
    }

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
  try {
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

    if (!isPatchAction(payload.action)) {
      return NextResponse.json(
        { message: "지원하지 않는 계정 수정 요청입니다." },
        { status: 400 },
      );
    }

    const issuedAccounts = await getIssuedAdminAccountsFromCookie(user);
    const dbAccounts = hasDatabaseUrl() ? await getAllAdminAccounts(user) : [];
    const targetAccount = hasDatabaseUrl()
      ? dbAccounts.find((account) => account.id === payload.id)
      : issuedAccounts.find((account) => account.id === payload.id);

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

    if (payload.action === "adjust-balance") {
      const amount = Number(payload.balanceAmount);

      if (targetAccount.role !== "TOP_DISTRIBUTOR" && targetAccount.role !== "ADMIN") {
        return NextResponse.json(
          { message: "총판 계정만 보유금을 조정할 수 있습니다." },
          { status: 400 },
        );
      }

      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        (payload.balanceDirection !== "increase" && payload.balanceDirection !== "decrease")
      ) {
        return NextResponse.json(
          { message: "조정할 보유금액을 확인해주세요." },
          { status: 400 },
        );
      }
    }

    if (hasDatabaseUrl()) {
      await updatePersistedAdminAccount({
        id: payload.id,
        action: payload.action,
        managedCompanies: payload.managedCompanies,
        balanceAmount: payload.balanceAmount,
        balanceDirection: payload.balanceDirection,
        processedBy: user.id,
      });
      const [updatedAccounts, managedCompanies] = await Promise.all([
        getAllAdminAccounts(user),
        getManagedCompanyOptions(user),
      ]);

      return NextResponse.json({
        accounts: toVisiblePasswordList(updatedAccounts),
        detailedAccounts: updatedAccounts,
        managedCompanies,
        message:
          payload.action === "delete"
            ? `${targetAccount.loginId} 계정이 삭제되었습니다.`
            : payload.action === "hard-delete"
              ? `${targetAccount.loginId} 계정이 완전 삭제되었습니다.`
            : payload.action === "toggle-status"
              ? targetAccount.status === "ACTIVE"
                ? `${targetAccount.loginId} 계정을 사용중지했습니다.`
                : `${targetAccount.loginId} 계정을 다시 사용 상태로 변경했습니다.`
            : payload.action === "adjust-balance"
              ? `${targetAccount.loginId} 계정의 보유금이 조정되었습니다.`
              : `${targetAccount.loginId} 계정의 관리업체를 수정했습니다.`,
      });
    }

    let nextAccounts = issuedAccounts;
    let message = "하부계정 정보가 수정되었습니다.";

    if (payload.action === "delete") {
      nextAccounts = issuedAccounts.filter((account) => account.id !== payload.id);
      message = `${targetAccount.loginId} 계정이 삭제되었습니다.`;
    }

    if (payload.action === "hard-delete") {
      nextAccounts = issuedAccounts.filter((account) => account.id !== payload.id);
      message = `${targetAccount.loginId} 계정이 완전 삭제되었습니다.`;
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

    if (payload.action === "adjust-balance") {
      const amount = Number(payload.balanceAmount ?? 0);
      const signedAmount = payload.balanceDirection === "decrease" ? -amount : amount;

      nextAccounts = issuedAccounts.map((account) =>
        account.id === payload.id
          ? {
              ...account,
              currentBalance: Math.max(0, account.currentBalance + signedAmount),
              updatedAt: getNowStamp(),
            }
          : account,
      );
      message = `${targetAccount.loginId} 계정의 보유금이 조정되었습니다.`;
    }

    const response = NextResponse.json({
      accounts: toVisiblePasswordList([...(await getAllAdminAccounts(user)).slice(0, 1), ...nextAccounts]),
      managedCompanies: await getManagedCompanyOptions(user),
      message,
    });

    setIssuedAdminAccountsCookie(response, nextAccounts);

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "하부계정 수정 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}

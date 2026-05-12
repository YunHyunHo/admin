"use server";

import { redirect } from "next/navigation";

import {
  clearSession,
  createSession,
  findAccount,
  type SessionUser,
} from "@/lib/auth";
import { recordAdminLogin } from "@/lib/admin-accounts";

export type LoginFormState = {
  error?: string;
};

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return {
      error: "아이디와 비밀번호를 모두 입력해주세요.",
    };
  }

  const account = await findAccount(username, password);

  if (!account) {
    return {
      error: "아이디 또는 비밀번호가 올바르지 않습니다.",
    };
  }

  const sessionUser: SessionUser = {
    id: account.id,
    username: account.loginId,
    loginId: account.loginId,
    nickname: account.nickname,
    role: account.role,
    status: account.status,
    companyId: account.companyId,
    companyName: account.companyName,
    apiLabel: account.apiLabel,
    managedCompanies: account.managedCompanies,
    createdBy: account.createdBy,
    lastLoginAt: account.lastLoginAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };

  await recordAdminLogin(account.loginId);
  await createSession(sessionUser);
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}

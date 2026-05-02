"use server";

import { redirect } from "next/navigation";

import {
  clearSession,
  createSession,
  findAccount,
  type SessionUser,
} from "@/lib/auth";

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

  const account = findAccount(username, password);

  if (!account) {
    return {
      error: "아이디 또는 비밀번호가 올바르지 않습니다.",
    };
  }

  const sessionUser: SessionUser = {
    username: account.username,
    companyId: account.companyId,
    companyName: account.companyName,
    apiLabel: account.apiLabel,
  };

  await createSession(sessionUser);
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}

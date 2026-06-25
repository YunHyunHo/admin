import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import {
  getAllAdminAccounts,
  getMasterAccount,
  type AdminAccountRecord,
} from "@/lib/admin-accounts";
import { verifyPassword } from "@/lib/password";

const SESSION_COOKIE = "vendor_admin_session";
const LOCAL_SESSION_SECRET = "local-dev-secret-change-me";
const PLACEHOLDER_SESSION_SECRET = "replace-with-a-long-random-secret";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

export type SessionUser = Omit<AdminAccountRecord, "password" | "visiblePassword"> & {
  username: string;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET ?? LOCAL_SESSION_SECRET;

  if (
    process.env.NODE_ENV === "production" &&
    (secret === LOCAL_SESSION_SECRET ||
      secret === PLACEHOLDER_SESSION_SECRET ||
      secret.length < 32)
  ) {
    throw new Error("운영 환경에서는 32자 이상의 안전한 SESSION_SECRET을 설정해주세요.");
  }

  return secret;
}

function getSignature(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

function encodeSession(user: SessionUser) {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  const signature = getSignature(payload);

  return `${payload}.${signature}`;
}

function decodeSession(value: string | undefined): SessionUser | null {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = getSignature(payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as SessionUser;

    return parsed;
  } catch {
    return null;
  }
}

export async function findAccount(username: string, password: string) {
  const accounts = await getAllAdminAccounts();
  const targetAccount = accounts.find(
    (account) =>
      account.loginId === username.trim() && account.status === "ACTIVE",
  );

  if (!targetAccount) {
    return undefined;
  }

  return (await verifyPassword(password, targetAccount.password))
    ? targetAccount
    : undefined;
}

export async function createSession(user: SessionUser) {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, encodeSession(user), {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;

  return decodeSession(raw);
}

export function getTestAccounts() {
  const { password, ...account } = getMasterAccount();

  return [
    {
      ...account,
      username: account.loginId,
      passwordHint: password,
    },
  ];
}

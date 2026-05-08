import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import {
  getAllAdminAccounts,
  getMasterAccount,
  type AdminAccountRecord,
} from "@/lib/admin-accounts";

const SESSION_COOKIE = "vendor_admin_session";
const LOCAL_SESSION_SECRET = "local-dev-secret-change-me";

export type SessionUser = Omit<AdminAccountRecord, "password"> & {
  username: string;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET ?? LOCAL_SESSION_SECRET;

  if (process.env.NODE_ENV === "production" && secret === LOCAL_SESSION_SECRET) {
    throw new Error("SESSION_SECRET 환경변수를 설정해주세요.");
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

  return accounts.find(
    (account) =>
      account.loginId === username.trim() &&
      account.password === password &&
      account.status === "ACTIVE",
  );
}

export async function createSession(user: SessionUser) {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, encodeSession(user), {
    httpOnly: true,
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

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "vendor_admin_session";
const LOCAL_SESSION_SECRET = "local-dev-secret-change-me";

type AccountRecord = {
  username: string;
  password: string;
  companyId: string;
  companyName: string;
  apiLabel: string;
};

export type SessionUser = Omit<AccountRecord, "password">;

const TEST_ACCOUNTS: AccountRecord[] = [
  {
    username: "admin1",
    password: process.env.ADMIN1_PASSWORD ?? "0000",
    companyId: "vendor-a",
    companyName: "원페이",
    apiLabel: "원페이 연동 API",
  },
  {
    username: "admin2",
    password: process.env.ADMIN2_PASSWORD ?? "0000",
    companyId: "vendor-b",
    companyName: "엠페이",
    apiLabel: "엠페이 연동 API",
  },
];

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

export function findAccount(username: string, password: string) {
  return TEST_ACCOUNTS.find(
    (account) =>
      account.username === username.trim() && account.password === password,
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
  return TEST_ACCOUNTS.map(({ password, ...account }) => ({
    ...account,
    passwordHint: password,
  }));
}

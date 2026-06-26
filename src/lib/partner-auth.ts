import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { query, withTransaction } from "@/lib/db";
import {
  getDomainChargeMode,
  type DomainChargeMode,
} from "@/lib/domain-charge-integration";
import {
  getDomainWithdrawAccount,
  type DomainWithdrawAccount,
} from "@/lib/domain-withdraw-account";
import { verifyPassword } from "@/lib/password";

const PARTNER_TOKEN_TTL_SECONDS = 60 * 60 * 24;
const PARTNER_REFRESH_TOKEN_BYTES = 32;
const PARTNER_REFRESH_TOKEN_TTL_DAYS = 30;

type PartnerDbRow = {
  admin_id: string;
  login_id: string;
  password_hash: string;
  admin_name: string;
  company_id: string;
  company_name: string;
  domain_id: string;
  domain_name: string | null;
};

export type PartnerLoginSuccess = {
  token: string;
  refreshToken?: string;
  user: {
    loginId: string;
    name: string;
    role: "partner_admin";
    permissions: string[];
    menus: string[];
  };
  partner: {
    id: string;
    name: string;
    domainId: string;
    domain: string;
    chargeMode: DomainChargeMode;
    withdrawAccount: DomainWithdrawAccount | null;
  };
};

type PartnerLoginResult = PartnerLoginSuccess & {
  audit: {
    adminId: string;
    domainId: string;
  };
};

type PartnerRefreshTokenRow = PartnerDbRow & {
  refresh_token_id: string;
};

export type PartnerAccessTokenPayload = {
  sub: string;
  loginId: string;
  role: "partner_admin";
  partnerId: string;
  partnerName: string;
  domainId: string;
  domain: string;
  permissions: string[];
  menus: string[];
  iat: number;
  exp: number;
};

const defaultPermissions = [
  "partner:charges",
  "partner:withdrawals",
  "partner:purchases",
  "partner:settlement",
];

const defaultMenus = ["charge", "withdrawal", "purchase", "settlement"];

function getPartnerTokenSecret() {
  return process.env.PARTNER_TOKEN_SECRET?.trim() || process.env.SESSION_SECRET || "local-dev-secret-change-me";
}

function signPayload(payload: string) {
  return createHmac("sha256", getPartnerTokenSecret()).update(payload).digest("hex");
}

function hashPartnerRefreshToken(refreshToken: string) {
  return createHash("sha256").update(refreshToken).digest("hex");
}

let refreshTokenSchemaPromise: Promise<void> | null = null;

async function ensurePartnerRefreshTokenSchema() {
  refreshTokenSchemaPromise ??= (async () => {
    await query(`
      create table if not exists partner_refresh_tokens (
        id uuid primary key default gen_random_uuid(),
        admin_id uuid not null references admins(id) on delete cascade,
        domain_id uuid not null references domains(id) on delete cascade,
        token_hash text not null unique,
        status text not null default 'ACTIVE',
        expires_at timestamptz not null,
        last_used_at timestamptz,
        created_at timestamptz not null default now(),
        revoked_at timestamptz,
        check (status in ('ACTIVE', 'REVOKED'))
      )
    `);
    await query(`
      create index if not exists partner_refresh_tokens_admin_status_idx
        on partner_refresh_tokens (admin_id, status, expires_at desc)
    `);
    await query(`
      create index if not exists partner_refresh_tokens_domain_status_idx
        on partner_refresh_tokens (domain_id, status, expires_at desc)
    `);
  })();

  try {
    return await refreshTokenSchemaPromise;
  } catch (error) {
    refreshTokenSchemaPromise = null;
    throw error;
  }
}

export function normalizePartnerDomain(value: string) {
  const raw = value.trim().toLowerCase();

  if (!raw) {
    return "";
  }

  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);

    return url.hostname.toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .toLowerCase();
  }
}

export function createPartnerAccessToken(payload: Omit<PartnerAccessTokenPayload, "iat" | "exp">) {
  const now = Math.floor(Date.now() / 1000);
  const body: PartnerAccessTokenPayload = {
    ...payload,
    iat: now,
    exp: now + PARTNER_TOKEN_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const signature = signPayload(encoded);

  return `${encoded}.${signature}`;
}

function createPartnerAccessTokenFromRow(row: PartnerDbRow) {
  return createPartnerAccessToken({
    sub: row.admin_id,
    loginId: row.login_id,
    role: "partner_admin",
    partnerId: row.company_id,
    partnerName: row.company_name,
    domainId: row.domain_id,
    domain: normalizePartnerDomain(row.domain_name ?? ""),
    permissions: defaultPermissions,
    menus: defaultMenus,
  });
}

export function verifyPartnerAccessToken(token: string) {
  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = signPayload(payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as PartnerAccessTokenPayload;

    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function getPartnerAccess(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";

  if (!authorization) {
    return { provided: false, access: null };
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  const access =
    scheme?.toLowerCase() === "bearer" && token
      ? verifyPartnerAccessToken(token)
      : null;

  return { provided: true, access };
}

async function issuePartnerRefreshToken(input: {
  adminId: string;
  domainId: string;
}) {
  await ensurePartnerRefreshTokenSchema();

  const refreshToken = `pr_${randomBytes(PARTNER_REFRESH_TOKEN_BYTES).toString("base64url")}`;
  const tokenHash = hashPartnerRefreshToken(refreshToken);

  await query(
    `
      insert into partner_refresh_tokens (
        admin_id,
        domain_id,
        token_hash,
        expires_at
      )
      values (
        $1::uuid,
        $2::uuid,
        $3,
        now() + ($4::int * interval '1 day')
      )
    `,
    [input.adminId, input.domainId, tokenHash, PARTNER_REFRESH_TOKEN_TTL_DAYS],
  );

  return refreshToken;
}

export async function logPartnerLoginAttempt(input: {
  loginId: string;
  domain: string;
  ok: boolean;
  message: string;
  adminId?: string | null;
  domainId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await query(
    `
      insert into admin_audit_logs (
        admin_id,
        action,
        resource_type,
        resource_id,
        before_data,
        after_data,
        ip_address,
        user_agent
      )
      values (
        $1::uuid,
        'partner_login',
        'partner_auth',
        $2::uuid,
        null,
        $3::jsonb,
        $4,
        $5
      )
    `,
    [
      input.adminId ?? null,
      input.domainId ?? null,
      JSON.stringify({
        loginId: input.loginId,
        domain: input.domain,
        ok: input.ok,
        message: input.message,
      }),
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ],
  );
}

export async function loginPartnerAccount(input: {
  loginId: string;
  password: string;
  domain?: string;
}): Promise<PartnerLoginResult | null> {
  const normalizedLoginId = input.loginId.trim();
  const normalizedDomain = normalizePartnerDomain(input.domain ?? "");

  if (!normalizedLoginId || !input.password) {
    return null;
  }

  const result = await query<PartnerDbRow>(
    `
      select
        a.id::text as admin_id,
        a.login_id,
        a.password_hash,
        a.name as admin_name,
        c.id::text as company_id,
        c.company_name,
        dom.id::text as domain_id,
        dom.domain_name
      from admins a
      join admin_company_mappings acm on acm.admin_id = a.id
      join companies c on c.id = acm.company_id
      join admin_domain_mappings adm on adm.admin_id = a.id
      join domains dom on dom.id = adm.domain_id
      where a.role = 'DOMAIN_ADMIN'
        and a.status = 'ACTIVE'
        and dom.status = 'ACTIVE'
        and a.login_id = $1
      order by dom.created_at desc
    `,
    [normalizedLoginId],
  );

  const matchedRow =
    (normalizedDomain
      ? result.rows.find(
          (row) => normalizePartnerDomain(row.domain_name ?? "") === normalizedDomain,
        )
      : null) ?? result.rows[0];

  if (!matchedRow) {
    return null;
  }

  const isValidPassword = await verifyPassword(input.password, matchedRow.password_hash);

  if (!isValidPassword) {
    return null;
  }

  const token = createPartnerAccessToken({
    sub: matchedRow.admin_id,
    loginId: matchedRow.login_id,
    role: "partner_admin",
    partnerId: matchedRow.company_id,
    partnerName: matchedRow.company_name,
    domainId: matchedRow.domain_id,
    domain: normalizePartnerDomain(matchedRow.domain_name ?? ""),
    permissions: defaultPermissions,
    menus: defaultMenus,
  });
  let refreshToken: string | undefined;

  try {
    refreshToken = await issuePartnerRefreshToken({
      adminId: matchedRow.admin_id,
      domainId: matchedRow.domain_id,
    });
  } catch (error) {
    console.error("Failed to issue partner refresh token", error);
  }
  const [withdrawAccount, chargeMode] = await Promise.all([
    getDomainWithdrawAccount(matchedRow.domain_id),
    getDomainChargeMode(matchedRow.domain_id),
  ]);

  return {
    token,
    refreshToken,
    user: {
      loginId: matchedRow.login_id,
      name: matchedRow.admin_name,
      role: "partner_admin",
      permissions: defaultPermissions,
      menus: defaultMenus,
    },
    partner: {
      id: matchedRow.company_id,
      name: matchedRow.company_name,
      domainId: matchedRow.domain_id,
      domain: normalizePartnerDomain(matchedRow.domain_name ?? ""),
      chargeMode,
      withdrawAccount,
    },
    audit: {
      adminId: matchedRow.admin_id,
      domainId: matchedRow.domain_id,
    },
  };
}

export async function refreshPartnerAccessToken(refreshToken: string) {
  const normalizedToken = refreshToken.trim();

  if (!normalizedToken) {
    return null;
  }

  await ensurePartnerRefreshTokenSchema();

  return withTransaction(async (client) => {
    const result = await client.query<PartnerRefreshTokenRow>(
      `
        select
          prt.id::text as refresh_token_id,
          a.id::text as admin_id,
          a.login_id,
          a.password_hash,
          a.name as admin_name,
          c.id::text as company_id,
          c.company_name,
          dom.id::text as domain_id,
          dom.domain_name
        from partner_refresh_tokens prt
        join admins a on a.id = prt.admin_id
        join admin_company_mappings acm on acm.admin_id = a.id
        join companies c on c.id = acm.company_id
        join admin_domain_mappings adm on adm.admin_id = a.id and adm.domain_id = prt.domain_id
        join domains dom on dom.id = adm.domain_id
        where prt.token_hash = $1
          and prt.status = 'ACTIVE'
          and prt.expires_at > now()
          and a.role = 'DOMAIN_ADMIN'
          and a.status = 'ACTIVE'
          and dom.status = 'ACTIVE'
        for update of prt
      `,
      [hashPartnerRefreshToken(normalizedToken)],
    );
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    await client.query(
      `
        update partner_refresh_tokens
        set last_used_at = now(),
            expires_at = now() + ($2::int * interval '1 day')
        where id = $1::uuid
      `,
      [row.refresh_token_id, PARTNER_REFRESH_TOKEN_TTL_DAYS],
    );

    return {
      token: createPartnerAccessTokenFromRow(row),
    };
  });
}

export async function revokePartnerRefreshToken(refreshToken: string) {
  const normalizedToken = refreshToken.trim();

  if (!normalizedToken) {
    return false;
  }

  await ensurePartnerRefreshTokenSchema();

  const result = await query<{ id: string }>(
    `
      update partner_refresh_tokens
      set status = 'REVOKED',
          revoked_at = coalesce(revoked_at, now())
      where token_hash = $1
        and status = 'ACTIVE'
      returning id::text
    `,
    [hashPartnerRefreshToken(normalizedToken)],
  );

  return Boolean(result.rows[0]);
}

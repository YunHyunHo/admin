import { createHmac, timingSafeEqual } from "node:crypto";

import { query } from "@/lib/db";
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
  const [withdrawAccount, chargeMode] = await Promise.all([
    getDomainWithdrawAccount(matchedRow.domain_id),
    getDomainChargeMode(matchedRow.domain_id),
  ]);

  return {
    token,
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

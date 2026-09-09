import { createHmac } from "node:crypto";
import { waitUntil } from "@vercel/functions";

import type { SessionUser } from "@/lib/auth";
import type { StoredAdminRequestEvent } from "@/lib/admin-request-events";
import { getPgPool } from "@/lib/db";

const realtimeAudience = "winpay-realtime-v2";
const deliveryAttempts = 3;
const deliveryTimeoutMs = 1200;

export type RealtimePrincipal = {
  principalType: "admin" | "partner";
  loginId: string;
  ownerLoginId: string;
  companyIds: string[];
  domainIds: string[];
  distributorIds: string[];
};

function envSet(name: string) {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getRealtimeUrl() {
  return (
    process.env.REALTIME_V2_URL?.trim() ||
    process.env.MAPLE_REALTIME_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
}

function getSharedSecret() {
  return process.env.REALTIME_SHARED_SECRET?.trim() ?? "";
}

export function getRealtimeEnvironment() {
  return process.env.VERCEL_ENV === "production" ? "production" : "preview";
}

function getEnabledOwnerLoginIds() {
  const configured = envSet("REALTIME_V2_OWNER_LOGIN_IDS");
  if (configured.size > 0) return configured;
  return getRealtimeEnvironment() === "preview" ? new Set(["maple"]) : new Set<string>();
}

export function isRealtimeV2Configured() {
  return (
    getRealtimeUrl().length > 0 &&
    getSharedSecret().length >= 32 &&
    getEnabledOwnerLoginIds().size > 0
  );
}

async function getOwnerLoginIdForAdmin(
  user: Pick<SessionUser, "loginId" | "role" | "createdBy">,
) {
  if (user.role === "MASTER") return user.loginId.trim().toLowerCase();
  if (!user.createdBy) return null;
  const result = await getPgPool().query<{ login_id: string }>(
    `select login_id from admins where id = $1::uuid and status <> 'DELETED' limit 1`,
    [user.createdBy],
  );
  return result.rows[0]?.login_id.trim().toLowerCase() ?? null;
}

async function getAdminScope(user: SessionUser, ownerLoginId: string) {
  if (user.role === "MASTER") {
    const result = await getPgPool().query<{
      company_ids: string[] | null;
      domain_ids: string[] | null;
      distributor_ids: string[] | null;
    }>(
      `with owner as (select id from admins where lower(login_id) = $1 limit 1),
       owned_companies as (
         select distinct acm.company_id
         from admin_company_mappings acm
         join admins a on a.id = acm.admin_id
         join owner o on a.created_by = o.id
         where a.status <> 'DELETED'
       ), owned_distributors as (
         select distinct d.id
         from distributors d
         join admins a on a.id = d.admin_id
         join owner o on a.created_by = o.id
         where d.status <> 'DELETED' and a.status <> 'DELETED'
       )
       select
         array(select company_id::text from owned_companies) company_ids,
         array(select id::text from domains where company_id in (select company_id from owned_companies) and status <> 'DELETED') domain_ids,
         array(select id::text from owned_distributors) distributor_ids`,
      [ownerLoginId],
    );
    return result.rows[0] ?? { company_ids: [], domain_ids: [], distributor_ids: [] };
  }

  if (user.role === "DOMAIN_ADMIN") {
    const result = await getPgPool().query<{
      company_ids: string[] | null;
      domain_ids: string[] | null;
      distributor_ids: string[] | null;
    }>(
      `select
         array(select company_id::text from admin_company_mappings where admin_id = $1::uuid) company_ids,
         array(select d.id::text from domains d where d.company_id in (select company_id from admin_company_mappings where admin_id = $1::uuid) and d.status <> 'DELETED') domain_ids,
         array[]::text[] distributor_ids`,
      [user.id],
    );
    return result.rows[0] ?? { company_ids: [], domain_ids: [], distributor_ids: [] };
  }

  const result = await getPgPool().query<{
    company_ids: string[] | null;
    domain_ids: string[] | null;
    distributor_ids: string[] | null;
  }>(
    `with scoped_distributors as (
       select d.id
       from distributors d
       where d.status <> 'DELETED'
         and (d.admin_id = $1::uuid or d.parent_distributor_id in (select id from distributors where admin_id = $1::uuid))
     )
     select
       array(select distinct company_id::text from domains where distributor_id in (select id from scoped_distributors) and status <> 'DELETED') company_ids,
       array(select id::text from domains where distributor_id in (select id from scoped_distributors) and status <> 'DELETED') domain_ids,
       array(select id::text from scoped_distributors) distributor_ids`,
    [user.id],
  );
  return result.rows[0] ?? { company_ids: [], domain_ids: [], distributor_ids: [] };
}

export async function getAdminRealtimePrincipal(user: SessionUser): Promise<RealtimePrincipal | null> {
  if (!isRealtimeV2Configured()) return null;
  const ownerLoginId = await getOwnerLoginIdForAdmin(user);
  if (!ownerLoginId || !getEnabledOwnerLoginIds().has(ownerLoginId)) return null;
  const scope = await getAdminScope(user, ownerLoginId);
  return {
    principalType: "admin",
    loginId: user.loginId,
    ownerLoginId,
    companyIds: scope.company_ids ?? [],
    domainIds: scope.domain_ids ?? [],
    distributorIds: scope.distributor_ids ?? [],
  };
}

export async function getPartnerRealtimePrincipal(input: { loginId: string; domainId: string }) {
  if (!isRealtimeV2Configured()) return null;
  const result = await getPgPool().query<{ owner_login_id: string }>(
    `select lower(owner.login_id) owner_login_id
       from domains d
       join admin_company_mappings acm on acm.company_id = d.company_id
       join admins domain_admin on domain_admin.id = acm.admin_id and domain_admin.role = 'DOMAIN_ADMIN'
       join admins owner on owner.id = domain_admin.created_by and owner.role = 'MASTER'
      where d.id = $1::uuid and d.status <> 'DELETED' and domain_admin.status <> 'DELETED'
      limit 1`,
    [input.domainId],
  );
  const ownerLoginId = result.rows[0]?.owner_login_id;
  if (!ownerLoginId || !getEnabledOwnerLoginIds().has(ownerLoginId)) return null;
  return {
    principalType: "partner" as const,
    loginId: input.loginId,
    ownerLoginId,
    companyIds: [],
    domainIds: [input.domainId],
    distributorIds: [],
  };
}

export async function getRealtimeGroupMode(ownerLoginId: string) {
  const result = await getPgPool().query<{ enabled: boolean }>(
    `select enabled from realtime_account_flags where environment = $1 and lower(login_id) = $2 limit 1`,
    [getRealtimeEnvironment(), ownerLoginId.toLowerCase()],
  );
  return result.rows[0]?.enabled === true ? "websocket" : "legacy";
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createRealtimeToken(input: {
  principal: RealtimePrincipal;
  clientInstanceId: string;
}) {
  const payload = base64UrlJson({
    aud: realtimeAudience,
    exp: Math.floor(Date.now() / 1000) + 60,
    iat: Math.floor(Date.now() / 1000),
    ...input.principal,
    clientInstanceId: input.clientInstanceId,
  });
  const signature = createHmac("sha256", getSharedSecret()).update(payload).digest("base64url");
  return {
    token: `${payload}.${signature}`,
    webSocketUrl: `${getRealtimeUrl().replace(/^http/, "ws")}/ws`,
  };
}

async function postInternal(path: string, body: unknown) {
  const response = await fetch(`${getRealtimeUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-realtime-secret": getSharedSecret() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(deliveryTimeoutMs),
  });
  return response.ok;
}

async function deliverEventId(event: StoredAdminRequestEvent) {
  for (let attempt = 1; attempt <= deliveryAttempts; attempt += 1) {
    try {
      if (await postInternal("/internal/events", { eventId: event.eventId })) return;
    } catch {
      // Durable Outbox reconciliation is the recovery path.
    }
    if (attempt < deliveryAttempts) await new Promise((resolve) => setTimeout(resolve, attempt * 150));
  }
  console.warn("[realtime-v2] fast-path-deferred-to-recovery", { eventId: event.eventId });
}

export function scheduleRealtimeDelivery(event: StoredAdminRequestEvent) {
  if (!isRealtimeV2Configured()) return;
  const delivery = deliverEventId(event).catch(() => undefined);
  try {
    waitUntil(delivery);
  } catch {
    void delivery;
  }
}

export async function notifyRealtimeGroupMode(ownerLoginId: string, enabled: boolean) {
  if (!isRealtimeV2Configured()) return false;
  return postInternal("/internal/control", { ownerLoginId: ownerLoginId.toLowerCase(), enabled });
}

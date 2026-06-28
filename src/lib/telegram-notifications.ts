import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { hasDatabaseUrl, query } from "@/lib/db";
import { ensureTelegramSchema } from "@/lib/telegram-schema";
import { getScopedDataCondition } from "@/lib/master-scope";
import type { SessionUser } from "@/lib/auth";

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };
type TelegramChat = { id: number; type: string; title?: string; username?: string; first_name?: string };

function cipherKey() {
  return createHash("sha256")
    .update(process.env.SESSION_SECRET ?? process.env.MASTER_PASSWORD ?? "local-dev-secret")
    .digest();
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptToken(value: string) {
  const [, iv, tag, encrypted] = value.split(":");
  const decipher = createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

async function telegramCall<T>(token: string, method: string, body?: object) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const data = (await response.json()) as TelegramResponse<T>;
  if (!response.ok || !data.ok || data.result === undefined) {
    throw new Error(data.description ?? "텔레그램 요청에 실패했습니다.");
  }
  return data.result;
}

export function canManageTelegramSettings(user: SessionUser) {
  return user.role === "MASTER" || (user.role === "DOMAIN_ADMIN" && !user.hasDomainMapping);
}

export async function getTelegramSettings(user: SessionUser) {
  if (!hasDatabaseUrl() || !canManageTelegramSettings(user)) return [];
  await ensureTelegramSchema();
  const scope = await getScopedDataCondition(user, {
    company: "dom",
    distributor: "dist",
    distributorAdmin: "dist_admin",
  });
  const result = await query<{
    domain_id: string; domain_name: string | null; company_name: string; bot_username: string | null;
    chat_title: string | null; enabled: boolean | null; connection_code: string | null;
  }>(`
    select dom.id::text as domain_id, dom.domain_name, c.company_name, s.bot_username,
      s.chat_title, s.enabled, s.connection_code
    from domains dom
    join companies c on c.id = dom.company_id and c.status = 'ACTIVE'
    left join distributors dist on dist.id = dom.distributor_id
    left join admins dist_admin on dist_admin.id = dist.admin_id
    left join telegram_company_settings s on s.domain_id = dom.id
    where dom.status <> 'DELETED'
      ${scope.sql}
    order by c.company_name, dom.domain_name
  `, scope.values);
  return result.rows.map((row) => ({
    domainId: row.domain_id, companyName: row.company_name,
    domainName: row.domain_name ?? "-",
    botUsername: row.bot_username, chatTitle: row.chat_title,
    connected: Boolean(row.enabled),
    startUrl: row.bot_username && row.connection_code
      ? `https://t.me/${row.bot_username}?start=${row.connection_code}`
      : null,
  }));
}

async function assertDomainAccess(user: SessionUser, domainId: string) {
  const settings = await getTelegramSettings(user);
  if (!settings.some((setting) => setting.domainId === domainId)) {
    throw new Error("해당 도메인의 텔레그램 설정 권한이 없습니다.");
  }
}

export async function saveTelegramBot(user: SessionUser, domainId: string, token: string) {
  if (!canManageTelegramSettings(user)) throw new Error("마스터 또는 어드민만 설정할 수 있습니다.");
  await ensureTelegramSchema();
  await assertDomainAccess(user, domainId);
  const bot = await telegramCall<{ username?: string }>(token.trim(), "getMe");
  if (!bot.username) throw new Error("봇 사용자명을 확인할 수 없습니다.");
  const connectionCode = randomBytes(12).toString("hex");
  await query(`
    insert into telegram_company_settings
      (company_id, domain_id, configured_by, bot_token_ciphertext, bot_username, connection_code, enabled)
    select dom.company_id, dom.id, $2::uuid, $3, $4, $5, false
    from domains dom where dom.id = $1::uuid
    on conflict (domain_id) where domain_id is not null do update set
      configured_by = excluded.configured_by,
      bot_token_ciphertext = excluded.bot_token_ciphertext,
      bot_username = excluded.bot_username,
      connection_code = excluded.connection_code,
      chat_id = null, chat_title = null, enabled = false,
      connected_at = null, updated_at = now()
  `, [domainId, user.id, encryptToken(token.trim()), bot.username, connectionCode]);
  return bot.username;
}

export async function connectTelegramChat(user: SessionUser, domainId: string) {
  await ensureTelegramSchema();
  await assertDomainAccess(user, domainId);
  const setting = (await query<{ bot_token_ciphertext: string; connection_code: string }>(`
    select bot_token_ciphertext, connection_code from telegram_company_settings where domain_id = $1::uuid
  `, [domainId])).rows[0];
  if (!setting) throw new Error("먼저 봇 토큰을 확인해주세요.");
  const token = decryptToken(setting.bot_token_ciphertext);
  const updates = await telegramCall<Array<{ message?: { text?: string; chat: TelegramChat }; channel_post?: { text?: string; chat: TelegramChat } }>>(
    token, "getUpdates", { limit: 100, timeout: 0, allowed_updates: ["message", "channel_post"] },
  );
  const startCommand = `/start ${setting.connection_code}`;
  const start = [...updates].reverse().map((item) => item.message ?? item.channel_post)
    .find((message) => message?.text === startCommand);
  if (!start) throw new Error("업체 전용 연결 링크에서 시작 버튼을 누른 뒤 다시 확인해주세요.");
  const title = start.chat.title ?? start.chat.first_name ?? start.chat.username ?? String(start.chat.id);
  await query(`
    update telegram_company_settings set chat_id = $2, chat_title = $3,
      enabled = true, connected_at = now(), updated_at = now()
    where domain_id = $1::uuid
  `, [domainId, String(start.chat.id), title]);
  await telegramCall(token, "sendMessage", { chat_id: start.chat.id, text: "✅ 환전 승인 알림이 연결되었습니다." });
  return title;
}

export async function sendTelegramTest(user: SessionUser, domainId: string) {
  await assertDomainAccess(user, domainId);
  const setting = (await query<{ bot_token_ciphertext: string; chat_id: string }>(`
    select bot_token_ciphertext, chat_id from telegram_company_settings
    where domain_id = $1::uuid and enabled = true
  `, [domainId])).rows[0];
  if (!setting?.chat_id) throw new Error("연결된 채팅방이 없습니다.");
  await telegramCall(decryptToken(setting.bot_token_ciphertext), "sendMessage", {
    chat_id: setting.chat_id, text: "🔔 환전 승인 테스트 알림입니다.",
  });
}

export type ExchangeDecisionTelegramPayload = {
  id: string;
  domainId: string | null;
  accountHolder: string;
  amount: number;
  status: "APPROVED" | "REJECTED";
};

type TransactionDecisionTelegramPayload = ExchangeDecisionTelegramPayload & {
  kind: "CHARGE" | "EXCHANGE";
};

async function notifyTransactionDecision(payload: TransactionDecisionTelegramPayload) {
  if (!payload.domainId) return;
  try {
    await ensureTelegramSchema();
    const setting = (await query<{ id: string; bot_token_ciphertext: string; chat_id: string }>(`
      select id::text, bot_token_ciphertext, chat_id from telegram_company_settings
      where domain_id = $1::uuid and enabled = true and chat_id is not null
    `, [payload.domainId])).rows[0];
    if (!setting) return;
    const eventType = `DOMAIN_${payload.kind}_${payload.status}`;
    const delivery = (await query<{ id: string }>(`
      insert into telegram_notification_deliveries (setting_id, event_type, event_id)
      values ($1::uuid, $2, $3::uuid)
      on conflict (setting_id, event_type, event_id) do nothing returning id::text
    `, [setting.id, eventType, payload.id])).rows[0];
    if (!delivery) return;
    const kind = payload.kind === "CHARGE" ? "충전" : "환전";
    const decision = payload.status === "APPROVED" ? "승인" : "거절";
    const text = `${payload.accountHolder} ${payload.amount.toLocaleString("ko-KR")}원 ${kind} ${decision}`;
    try {
      await telegramCall(decryptToken(setting.bot_token_ciphertext), "sendMessage", { chat_id: setting.chat_id, text });
      await query(`update telegram_notification_deliveries set status='SENT', attempts=attempts+1, sent_at=now(), updated_at=now() where id=$1::uuid`, [delivery.id]);
    } catch (error) {
      await query(`update telegram_notification_deliveries set status='FAILED', attempts=attempts+1, last_error=$2, updated_at=now() where id=$1::uuid`, [delivery.id, error instanceof Error ? error.message : "전송 실패"]);
    }
  } catch (error) {
    console.error("Telegram notification failed", error);
  }
}

export async function notifyExchangeDecision(payload: ExchangeDecisionTelegramPayload) {
  await notifyTransactionDecision({ ...payload, kind: "EXCHANGE" });
}

export async function notifyChargeDecision(
  id: string,
  status: "APPROVED" | "REJECTED",
) {
  try {
    const charge = (await query<{
      id: string;
      domain_id: string | null;
      depositor: string | null;
      amount: string;
    }>(`
      select id::text, domain_id::text, depositor, amount::text
      from charge_requests
      where id = $1::uuid and status = $2::request_status
    `, [id, status])).rows[0];
    if (!charge) return;
    await notifyTransactionDecision({
      id: charge.id,
      domainId: charge.domain_id,
      accountHolder: charge.depositor ?? "-",
      amount: Number(charge.amount),
      status,
      kind: "CHARGE",
    });
  } catch (error) {
    console.error("Telegram charge notification failed", error);
  }
}

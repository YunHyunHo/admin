import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { hasDatabaseUrl, query } from "@/lib/db";
import { ensureTelegramSchema } from "@/lib/telegram-schema";
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

export async function getTelegramSettings(user: SessionUser) {
  if (!hasDatabaseUrl() || user.role !== "DOMAIN_ADMIN") return [];
  await ensureTelegramSchema();
  const result = await query<{
    company_id: string; company_name: string; bot_username: string | null;
    chat_title: string | null; enabled: boolean | null; connection_code: string | null;
  }>(`
    select c.id::text as company_id, c.company_name, s.bot_username,
      s.chat_title, s.enabled, s.connection_code
    from admin_company_mappings acm
    join companies c on c.id = acm.company_id and c.status = 'ACTIVE'
    left join telegram_company_settings s on s.company_id = c.id
    where acm.admin_id = $1::uuid
    order by c.company_name
  `, [user.id]);
  return result.rows.map((row) => ({
    companyId: row.company_id, companyName: row.company_name,
    botUsername: row.bot_username, chatTitle: row.chat_title,
    connected: Boolean(row.enabled),
    startUrl: row.bot_username && row.connection_code
      ? `https://t.me/${row.bot_username}?start=${row.connection_code}`
      : null,
  }));
}

async function assertCompanyAccess(user: SessionUser, companyId: string) {
  const result = await query(`
    select 1 from admin_company_mappings
    where admin_id = $1::uuid and company_id = $2::uuid
  `, [user.id, companyId]);
  if (!result.rowCount) throw new Error("해당 업체의 텔레그램 설정 권한이 없습니다.");
}

export async function saveTelegramBot(user: SessionUser, companyId: string, token: string) {
  if (user.role !== "DOMAIN_ADMIN") throw new Error("업체 어드민만 설정할 수 있습니다.");
  await ensureTelegramSchema();
  await assertCompanyAccess(user, companyId);
  const bot = await telegramCall<{ username?: string }>(token.trim(), "getMe");
  if (!bot.username) throw new Error("봇 사용자명을 확인할 수 없습니다.");
  const connectionCode = randomBytes(12).toString("hex");
  await query(`
    insert into telegram_company_settings
      (company_id, configured_by, bot_token_ciphertext, bot_username, connection_code, enabled)
    values ($1::uuid, $2::uuid, $3, $4, $5, false)
    on conflict (company_id) do update set
      configured_by = excluded.configured_by,
      bot_token_ciphertext = excluded.bot_token_ciphertext,
      bot_username = excluded.bot_username,
      connection_code = excluded.connection_code,
      chat_id = null, chat_title = null, enabled = false,
      connected_at = null, updated_at = now()
  `, [companyId, user.id, encryptToken(token.trim()), bot.username, connectionCode]);
  return bot.username;
}

export async function connectTelegramChat(user: SessionUser, companyId: string) {
  await ensureTelegramSchema();
  await assertCompanyAccess(user, companyId);
  const setting = (await query<{ bot_token_ciphertext: string; connection_code: string }>(`
    select bot_token_ciphertext, connection_code from telegram_company_settings where company_id = $1::uuid
  `, [companyId])).rows[0];
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
    where company_id = $1::uuid
  `, [companyId, String(start.chat.id), title]);
  await telegramCall(token, "sendMessage", { chat_id: start.chat.id, text: "✅ 환전 승인 알림이 연결되었습니다." });
  return title;
}

export async function sendTelegramTest(user: SessionUser, companyId: string) {
  await assertCompanyAccess(user, companyId);
  const setting = (await query<{ bot_token_ciphertext: string; chat_id: string }>(`
    select bot_token_ciphertext, chat_id from telegram_company_settings
    where company_id = $1::uuid and enabled = true
  `, [companyId])).rows[0];
  if (!setting?.chat_id) throw new Error("연결된 채팅방이 없습니다.");
  await telegramCall(decryptToken(setting.bot_token_ciphertext), "sendMessage", {
    chat_id: setting.chat_id, text: "🔔 환전 승인 테스트 알림입니다.",
  });
}

export type ApprovedExchangeTelegramPayload = {
  id: string; companyId: string; companyName: string; domainName: string;
  bankName: string; accountHolder: string; amount: number; approvedAt: string;
};

export async function notifyApprovedExchange(payload: ApprovedExchangeTelegramPayload) {
  try {
    await ensureTelegramSchema();
    const setting = (await query<{ id: string; bot_token_ciphertext: string; chat_id: string }>(`
      select id::text, bot_token_ciphertext, chat_id from telegram_company_settings
      where company_id = $1::uuid and enabled = true and chat_id is not null
    `, [payload.companyId])).rows[0];
    if (!setting) return;
    const delivery = (await query<{ id: string }>(`
      insert into telegram_notification_deliveries (setting_id, event_type, event_id)
      values ($1::uuid, 'DOMAIN_EXCHANGE_APPROVED', $2::uuid)
      on conflict (setting_id, event_type, event_id) do nothing returning id::text
    `, [setting.id, payload.id])).rows[0];
    if (!delivery) return;
    const text = ["✅ 환전 승인 완료", `업체: ${payload.companyName}`, `도메인: ${payload.domainName}`,
      `은행명: ${payload.bankName}`, `예금주: ${payload.accountHolder}`,
      `환전금액: ${payload.amount.toLocaleString("ko-KR")}원`, "승인상태: 승인", `승인일시: ${payload.approvedAt}`].join("\n");
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

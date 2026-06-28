import { query } from "@/lib/db";

let schemaReady = false;

export async function ensureTelegramSchema() {
  if (schemaReady) return;

  await query(`
    create table if not exists telegram_company_settings (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null unique references companies(id) on delete cascade,
      configured_by uuid not null references admins(id),
      bot_token_ciphertext text not null,
      bot_username text not null,
      connection_code text not null,
      chat_id text,
      chat_title text,
      enabled boolean not null default false,
      connected_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table telegram_company_settings
      add column if not exists connection_code text;

    create table if not exists telegram_notification_deliveries (
      id uuid primary key default gen_random_uuid(),
      setting_id uuid not null references telegram_company_settings(id) on delete cascade,
      event_type text not null,
      event_id uuid not null,
      status text not null default 'PENDING',
      attempts integer not null default 0,
      last_error text,
      sent_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (setting_id, event_type, event_id),
      check (status in ('PENDING', 'SENT', 'FAILED'))
    );
  `);
  schemaReady = true;
}

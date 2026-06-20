import { createHash } from "node:crypto";

import { query } from "@/lib/db";

export type DomainChargeMode = "API" | "MANUAL";

export type DomainChargeIntegrationScope = {
  integrationId: string;
  masterAdminId: string;
  companyId: string;
  domainId: string;
  distributorId: string | null;
  domainAdminLoginId: string;
};

let schemaReady = false;

export async function ensureDomainChargeIntegrationSchema() {
  if (schemaReady) {
    return;
  }

  await query(`
    alter table charge_requests
      add column if not exists account_holder text
  `);
  await query(`
    create table if not exists domain_charge_integrations (
      id uuid primary key default gen_random_uuid(),
      master_admin_id uuid not null references admins(id),
      domain_id uuid not null references domains(id) on delete cascade,
      label text,
      api_key_prefix text not null,
      api_key_hash text not null unique,
      status text not null default 'ACTIVE',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      revoked_at timestamptz,
      check (status in ('ACTIVE', 'REVOKED'))
    )
  `);
  await query(`
    create unique index if not exists domain_charge_integrations_active_domain_idx
      on domain_charge_integrations (domain_id)
      where status = 'ACTIVE'
  `);
  await query(`
    create index if not exists domain_charge_integrations_master_status_idx
      on domain_charge_integrations (master_admin_id, status, created_at desc)
  `);

  schemaReady = true;
}

function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

export async function getDomainChargeMode(
  domainId: string,
): Promise<DomainChargeMode> {
  await ensureDomainChargeIntegrationSchema();

  const result = await query<{ exists: boolean }>(
    `
      select exists (
        select 1
        from domain_charge_integrations
        where domain_id = $1::uuid
          and status = 'ACTIVE'
      ) as exists
    `,
    [domainId],
  );

  return result.rows[0]?.exists ? "API" : "MANUAL";
}

export async function getDomainChargeModeByIdentifier(input: {
  domainId?: string | null;
  domainName?: string | null;
}): Promise<DomainChargeMode> {
  await ensureDomainChargeIntegrationSchema();

  const result = await query<{ mode: DomainChargeMode }>(
    `
      select case
        when exists (
          select 1
          from domain_charge_integrations integration
          where integration.domain_id = dom.id
            and integration.status = 'ACTIVE'
        ) then 'API'
        else 'MANUAL'
      end as mode
      from domains dom
      join companies c on c.id = dom.company_id
      where dom.status = 'ACTIVE'
        and (
          ($1::uuid is not null and dom.id = $1::uuid)
          or (
            $1::uuid is null
            and $2::text is not null
            and (dom.domain_name = $2 or c.company_name = $2)
          )
        )
      limit 1
    `,
    [input.domainId || null, input.domainName || null],
  );

  return result.rows[0]?.mode ?? "MANUAL";
}

export async function resolveDomainChargeIntegration(
  apiKey: string,
): Promise<DomainChargeIntegrationScope | null> {
  await ensureDomainChargeIntegrationSchema();

  const normalizedKey = apiKey.trim();

  if (!normalizedKey) {
    return null;
  }

  const result = await query<DomainChargeIntegrationScope>(
    `
      select
        integration.id::text as "integrationId",
        integration.master_admin_id::text as "masterAdminId",
        dom.company_id::text as "companyId",
        dom.id::text as "domainId",
        dom.distributor_id::text as "distributorId",
        domain_admin.login_id as "domainAdminLoginId"
      from domain_charge_integrations integration
      join admins master_admin
        on master_admin.id = integration.master_admin_id
       and master_admin.role = 'MASTER'
       and master_admin.status = 'ACTIVE'
      join domains dom
        on dom.id = integration.domain_id
       and dom.status = 'ACTIVE'
      join lateral (
        select a.login_id
        from admin_domain_mappings adm
        join admins a on a.id = adm.admin_id
        where adm.domain_id = dom.id
          and a.role = 'DOMAIN_ADMIN'
          and a.status = 'ACTIVE'
          and a.created_by = integration.master_admin_id
        order by a.created_at desc
        limit 1
      ) domain_admin on true
      where integration.api_key_hash = $1
        and integration.status = 'ACTIVE'
      limit 1
    `,
    [hashApiKey(normalizedKey)],
  );

  return result.rows[0] ?? null;
}

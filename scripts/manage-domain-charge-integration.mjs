import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";

async function loadLocalEnv() {
  try {
    const envText = await readFile(new URL("../.env.local", import.meta.url), "utf8");

    for (const line of envText.split(/\r?\n/)) {
      const separatorIndex = line.indexOf("=");

      if (separatorIndex <= 0 || line.trimStart().startsWith("#")) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function readOptions(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];

    if (!key.startsWith("--")) {
      continue;
    }

    options[key.slice(2)] = args[index + 1] ?? "";
    index += 1;
  }

  return options;
}

async function ensureSchema(client) {
  await client.query(`
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
  await client.query(`
    create unique index if not exists domain_charge_integrations_active_domain_idx
      on domain_charge_integrations (domain_id)
      where status = 'ACTIVE'
  `);
}

async function findDomain(client, masterLoginId, domainIdentifier) {
  const result = await client.query(
    `
      select distinct
        master_admin.id::text as master_admin_id,
        dom.id::text as domain_id,
        coalesce(nullif(dom.domain_name, ''), c.company_name) as domain_name
      from admins master_admin
      join admins domain_admin
        on domain_admin.created_by = master_admin.id
       and domain_admin.role = 'DOMAIN_ADMIN'
       and domain_admin.status = 'ACTIVE'
      join admin_domain_mappings adm on adm.admin_id = domain_admin.id
      join domains dom on dom.id = adm.domain_id and dom.status = 'ACTIVE'
      join companies c on c.id = dom.company_id
      where master_admin.login_id = $1
        and master_admin.role = 'MASTER'
        and master_admin.status = 'ACTIVE'
        and (
          dom.id::text = $2
          or dom.domain_name = $2
          or c.company_name = $2
        )
      order by domain_name
      limit 2
    `,
    [masterLoginId, domainIdentifier],
  );

  if (!result.rows.length) {
    throw new Error("마스터 범위에서 활성 도메인을 찾을 수 없습니다.");
  }

  if (result.rows.length > 1) {
    throw new Error("동일한 이름의 도메인이 여러 개입니다. 도메인 UUID를 사용해주세요.");
  }

  return result.rows[0];
}

function createApiKey() {
  return `wp_live_${randomBytes(32).toString("base64url")}`;
}

function hashApiKey(apiKey) {
  return createHash("sha256").update(apiKey).digest("hex");
}

async function main() {
  await loadLocalEnv();

  const [command, ...args] = process.argv.slice(2);
  const options = readOptions(args);

  if (!command || !["issue", "revoke", "status"].includes(command)) {
    throw new Error(
      "사용법: npm run integration:key -- <issue|revoke|status> --master <마스터ID> --domain <도메인ID|도메인명> [--label <업체명>]",
    );
  }

  if (!options.master || !options.domain) {
    throw new Error("--master와 --domain 값이 필요합니다.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "false"
        ? false
        : { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    await client.query("begin");
    await ensureSchema(client);
    const domain = await findDomain(client, options.master, options.domain);

    if (command === "issue") {
      const apiKey = createApiKey();

      await client.query(
        `
          update domain_charge_integrations
          set status = 'REVOKED', revoked_at = now(), updated_at = now()
          where domain_id = $1::uuid and status = 'ACTIVE'
        `,
        [domain.domain_id],
      );
      await client.query(
        `
          insert into domain_charge_integrations (
            master_admin_id,
            domain_id,
            label,
            api_key_prefix,
            api_key_hash
          )
          values ($1::uuid, $2::uuid, $3, $4, $5)
        `,
        [
          domain.master_admin_id,
          domain.domain_id,
          options.label || domain.domain_name,
          apiKey.slice(0, 16),
          hashApiKey(apiKey),
        ],
      );

      await client.query("commit");
      console.log(`도메인: ${domain.domain_name} (${domain.domain_id})`);
      console.log(`API 키: ${apiKey}`);
      console.log("이 키는 다시 조회할 수 없으므로 안전하게 전달·보관해주세요.");
      return;
    }

    if (command === "revoke") {
      const result = await client.query(
        `
          update domain_charge_integrations
          set status = 'REVOKED', revoked_at = now(), updated_at = now()
          where domain_id = $1::uuid and status = 'ACTIVE'
          returning api_key_prefix
        `,
        [domain.domain_id],
      );

      await client.query("commit");
      console.log(result.rowCount ? "활성 API 키를 중지했습니다." : "활성 API 키가 없습니다.");
      return;
    }

    const result = await client.query(
      `
        select api_key_prefix, status, created_at, revoked_at
        from domain_charge_integrations
        where domain_id = $1::uuid
        order by created_at desc
      `,
      [domain.domain_id],
    );

    await client.query("commit");
    console.table(result.rows);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

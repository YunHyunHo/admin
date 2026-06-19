import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;

const requiredEnvKeys = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "MASTER_PASSWORD",
  "NEXT_PUBLIC_APP_URL",
];

const weakValues = new Set([
  "",
  "0000",
  "password",
  "changeme",
  "replace-with-a-long-random-secret",
  "local-dev-secret-change-me",
]);

async function loadLocalEnv() {
  const envUrl = new URL("../.env.local", import.meta.url);

  try {
    const envText = await readFile(envUrl, "utf8");

    for (const line of envText.split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const value = trimmedLine
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^"(.*)"$/, "$1");

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

function maskDatabaseUrl(databaseUrl) {
  try {
    const url = new URL(databaseUrl);

    if (url.password) {
      url.password = "****";
    }

    return url.toString();
  } catch {
    return databaseUrl ? "[configured]" : "[missing]";
  }
}

function checkEnv() {
  const failures = [];
  const warnings = [];

  for (const key of requiredEnvKeys) {
    if (!process.env[key]?.trim()) {
      failures.push(`${key} 값을 설정해야 합니다.`);
    }
  }

  const sessionSecret = process.env.SESSION_SECRET?.trim() ?? "";
  const masterPassword = process.env.MASTER_PASSWORD?.trim() ?? "";
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";

  if (weakValues.has(sessionSecret) || sessionSecret.length < 32) {
    failures.push("SESSION_SECRET은 32자 이상의 랜덤 문자열이어야 합니다.");
  }

  if (weakValues.has(masterPassword) || masterPassword.length < 10) {
    warnings.push("MASTER_PASSWORD는 운영 전에 10자 이상 강한 비밀번호로 바꾸세요.");
  }

  if (databaseUrl && !databaseUrl.startsWith("postgres")) {
    failures.push("DATABASE_URL은 postgresql:// 또는 postgres:// 형식이어야 합니다.");
  }

  if (databaseUrl.includes("USER:PASSWORD@HOST")) {
    failures.push("DATABASE_URL 예시값을 실제 DB 연결 문자열로 바꿔야 합니다.");
  }

  if (databaseUrl.includes("sslmode=require") && process.env.DATABASE_SSL === "false") {
    warnings.push("DATABASE_URL은 SSL을 요구하지만 DATABASE_SSL=false로 설정되어 있습니다.");
  }

  if (appUrl && !/^https?:\/\//.test(appUrl)) {
    failures.push("NEXT_PUBLIC_APP_URL은 http:// 또는 https://로 시작해야 합니다.");
  }

  if (appUrl.startsWith("http://localhost")) {
    warnings.push("운영 배포 전 NEXT_PUBLIC_APP_URL을 실제 관리자 도메인으로 바꾸세요.");
  }

  return { failures, warnings };
}

async function checkDatabaseIsolation() {
  const failures = [];
  const warnings = [];
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return { failures, warnings };
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });

  try {
    const [
      sharedCompanies,
      orphanCompanyMappings,
      orphanDomainMappings,
      ownerlessAdmins,
    ] = await Promise.all([
      pool.query(`
        select
          c.id::text,
          c.company_name,
          array_agg(distinct creator.login_id order by creator.login_id) as masters
        from admin_company_mappings acm
        join companies c on c.id = acm.company_id
        join admins child_admin on child_admin.id = acm.admin_id
        join admins creator on creator.id = child_admin.created_by
        where child_admin.status <> 'DELETED'
          and creator.role = 'MASTER'
          and creator.status <> 'DELETED'
        group by c.id, c.company_name
        having count(distinct creator.id) > 1
        order by c.company_name asc
      `),
      pool.query(`
        select count(*)::int as count
        from admin_company_mappings acm
        left join admins a on a.id = acm.admin_id
        where a.id is null
          or a.status = 'DELETED'
      `),
      pool.query(`
        select count(*)::int as count
        from admin_domain_mappings adm
        left join admins a on a.id = adm.admin_id
        left join domains d on d.id = adm.domain_id
        where a.id is null
          or a.status = 'DELETED'
          or d.id is null
          or d.status = 'DELETED'
      `),
      pool.query(`
        select count(*)::int as count
        from admins
        where role <> 'MASTER'
          and status <> 'DELETED'
          and created_by is null
      `),
    ]);

    if (sharedCompanies.rows.length) {
      failures.push(
        `서로 다른 마스터가 같은 업체를 공유 중입니다: ${sharedCompanies.rows
          .map((row) => `${row.company_name}(${row.masters.join(", ")})`)
          .join(", ")}`,
      );
    }

    const orphanCompanyMappingCount = orphanCompanyMappings.rows[0]?.count ?? 0;
    const orphanDomainMappingCount = orphanDomainMappings.rows[0]?.count ?? 0;
    const ownerlessAdminCount = ownerlessAdmins.rows[0]?.count ?? 0;

    if (orphanCompanyMappingCount > 0) {
      warnings.push(`삭제되었거나 없는 어드민의 업체 매핑이 ${orphanCompanyMappingCount}개 남아 있습니다.`);
    }

    if (orphanDomainMappingCount > 0) {
      warnings.push(`삭제되었거나 없는 어드민/도메인의 도메인 매핑이 ${orphanDomainMappingCount}개 남아 있습니다.`);
    }

    if (ownerlessAdminCount > 0) {
      failures.push(`마스터 소유자가 없는 비마스터 계정이 ${ownerlessAdminCount}개 있습니다.`);
    }
  } finally {
    await pool.end();
  }

  return { failures, warnings };
}

async function main() {
  await loadLocalEnv();

  const { failures, warnings } = checkEnv();
  const databaseIsolation = failures.length
    ? { failures: [], warnings: [] }
    : await checkDatabaseIsolation();
  failures.push(...databaseIsolation.failures);
  warnings.push(...databaseIsolation.warnings);

  console.log("Operations check");
  console.log(`DATABASE_URL: ${maskDatabaseUrl(process.env.DATABASE_URL ?? "")}`);
  console.log(`DATABASE_SSL: ${process.env.DATABASE_SSL ?? "true"}`);
  console.log(`NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL ?? "[missing]"}`);

  if (warnings.length) {
    console.log("\nWarnings");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (failures.length) {
    console.log("\nFailures");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log("\nOK: 운영 필수 환경변수 점검을 통과했습니다.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

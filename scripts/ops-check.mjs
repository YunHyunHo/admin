import { readFile } from "node:fs/promises";

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

async function main() {
  await loadLocalEnv();

  const { failures, warnings } = checkEnv();

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

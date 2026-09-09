import fs from "node:fs";
import process from "node:process";
import { Pool } from "pg";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, index);
    if (!process.env[key]) process.env[key] = line.slice(index + 1);
  }
}

const [environment, ownerLoginIdRaw, mode, confirmation] = process.argv.slice(2);
const ownerLoginId = ownerLoginIdRaw?.trim().toLowerCase();
const enabled = mode === "on" ? true : mode === "off" ? false : null;
if (!["preview", "production"].includes(environment) || !ownerLoginId || enabled === null) {
  throw new Error("사용법: node scripts/realtime-group-flag.mjs <preview|production> <ownerLoginId> <on|off>");
}
if (environment === "production" && confirmation !== "--confirm-production") {
  throw new Error("Production 변경에는 --confirm-production 옵션이 필요합니다.");
}

const databaseUrl = process.env.DATABASE_URL;
const realtimeUrl = (process.env.REALTIME_V2_URL || process.env.MAPLE_REALTIME_URL || "").replace(/\/$/, "");
const secret = process.env.REALTIME_SHARED_SECRET;
if (!databaseUrl || !realtimeUrl || !secret) throw new Error("Realtime 서버 환경변수를 확인해주세요.");

const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
try {
  await pool.query(
    `insert into realtime_account_flags(environment, login_id, enabled, updated_at)
     values ($1, $2, $3, now())
     on conflict(environment, login_id) do update set enabled = excluded.enabled, updated_at = now()`,
    [environment, ownerLoginId, enabled],
  );

  let pushed = false;
  try {
    const response = await fetch(`${realtimeUrl}/internal/control`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-realtime-secret": secret },
      body: JSON.stringify({ ownerLoginId, enabled }),
      signal: AbortSignal.timeout(2000),
    });
    pushed = response.ok;
  } catch {
    // Clients still verify the stored flag on connection/visibility.
  }
  console.log(JSON.stringify({ environment, ownerLoginId, mode, stored: true, pushed }));
} finally {
  await pool.end();
}

import { getPgPool } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { isMapleRealtimeStagingUser } from "@/lib/realtime-staging";

export async function getRealtimeAccountControl(user: SessionUser): Promise<{mode: "legacy" | "websocket"; checkIntervalMs: number}> {
  // Production remains disabled until a separately reviewed Canary rollout.
  if (!isMapleRealtimeStagingUser(user)) return {mode: "legacy", checkIntervalMs: 60000};
  try {
    const config = {
      text: `select enabled, check_interval_ms from realtime_account_flags
        where environment = $1 and login_id = $2`,
      values: ["preview", user.loginId.trim().toLowerCase()],
      query_timeout: 1500,
    };
    const result = await getPgPool().query<{ enabled: boolean; check_interval_ms: number }>(config);
    const row = result.rows[0];
    return {mode: row?.enabled === true ? "websocket" : "legacy",
      checkIntervalMs: [5000, 30000, 60000].includes(row?.check_interval_ms) ? row.check_interval_ms : 5000};
  } catch {
    // Missing configuration or control-plane failure must not disable notifications.
    return {mode: "legacy", checkIntervalMs: 5000};
  }
}

export async function getRealtimeAccountMode(user: SessionUser) {
  return (await getRealtimeAccountControl(user)).mode;
}

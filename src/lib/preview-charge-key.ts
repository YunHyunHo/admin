import { createHash, timingSafeEqual } from "node:crypto";

type KeyRoute = { kind: "legacy"; hash: string } | { kind: "preview"; domainId: string } | { kind: "reject" };

/** Server-only test credential. Never insert this credential into the legacy key table. */
export function routeChargeKey(key: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()): KeyRoute {
  const normalized = key.trim();
  if (!normalized) return { kind: "reject" };
  if (!normalized.startsWith("wp_preview_")) {
    return { kind: "legacy", hash: createHash("sha256").update(normalized).digest("hex") };
  }
  const configured = env.MAPLE_PREVIEW_CHARGE_API_KEY?.trim() ?? "";
  const domainId = env.MAPLE_PREVIEW_CHARGE_DOMAIN_ID?.trim() ?? "";
  const expiresAt = Date.parse(env.MAPLE_PREVIEW_CHARGE_KEY_EXPIRES_AT ?? "");
  if (env.VERCEL_ENV !== "preview" || env.VERCEL_GIT_COMMIT_REF !== "codex/maple-sse-no-polling" ||
      !/^wp_preview_[A-Za-z0-9_-]{43,}$/.test(configured) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(domainId) ||
      !Number.isFinite(expiresAt) || now >= expiresAt) return { kind: "reject" };
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(normalized), digest(configured))
    ? { kind: "preview", domainId } : { kind: "reject" };
}

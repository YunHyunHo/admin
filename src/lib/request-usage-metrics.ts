import { after } from "next/server";

import type { SessionUser } from "@/lib/auth";
import { hasDatabaseUrl, query } from "@/lib/db";
import type { PartnerAccessTokenPayload } from "@/lib/partner-auth";

const bucketDurationMs = 5 * 60 * 1000;
const retentionDays = 7;

export type RequestUsageIdentity = {
  source: "ADMIN_PORTAL" | "PARTNER_API";
  accountType: "ADMIN" | "DOMAIN";
  accountId: string;
  loginId: string;
  accountName: string;
  role: string;
  domainId?: string | null;
  companyId?: string | null;
};

type UsageBucket = RequestUsageIdentity & {
  bucketStartMs: number;
  route: string;
  method: string;
  requestCount: number;
};

type RequestUsageState = {
  buckets: Map<string, UsageBucket>;
  flushPromise: Promise<void> | null;
  flushScheduled: boolean;
  oldestBucketStartMs: number | null;
  lastCleanupAtMs: number;
};

type GlobalWithRequestUsage = typeof globalThis & {
  __requestUsageState?: RequestUsageState;
};

let schemaPromise: Promise<void> | null = null;

function getState() {
  const globalStore = globalThis as GlobalWithRequestUsage;

  globalStore.__requestUsageState ??= {
    buckets: new Map(),
    flushPromise: null,
    flushScheduled: false,
    oldestBucketStartMs: null,
    lastCleanupAtMs: 0,
  };

  return globalStore.__requestUsageState;
}

function getBucketStartMs(timestampMs = Date.now()) {
  return Math.floor(timestampMs / bucketDurationMs) * bucketDurationMs;
}

function getBucketKey(bucket: UsageBucket) {
  return [
    bucket.bucketStartMs,
    bucket.source,
    bucket.accountType,
    bucket.accountId,
    bucket.route,
    bucket.method,
  ].join(":");
}

function normalizeRoute(request: Request, route?: string) {
  const url = new URL(request.url);
  const pathname = route ?? url.pathname;
  const mode = url.searchParams.get("mode")?.trim();

  return mode ? `${pathname}?mode=${mode}` : pathname;
}

function recalculateOldestBucketStart(state: RequestUsageState) {
  let oldest: number | null = null;

  for (const bucket of state.buckets.values()) {
    oldest = oldest === null ? bucket.bucketStartMs : Math.min(oldest, bucket.bucketStartMs);
  }

  state.oldestBucketStartMs = oldest;
}

export async function ensureRequestUsageMetricsSchema() {
  if (!hasDatabaseUrl()) {
    return;
  }

  schemaPromise ??= (async () => {
    await query(`
      create table if not exists request_usage_metrics (
        bucket_start timestamptz not null,
        source text not null,
        account_type text not null,
        account_id text not null,
        login_id text not null,
        account_name text not null,
        role text not null,
        domain_id text,
        company_id text,
        route text not null,
        method text not null,
        request_count bigint not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (
          bucket_start,
          source,
          account_type,
          account_id,
          route,
          method
        )
      )
    `);
    await query(`
      create index if not exists request_usage_metrics_bucket_idx
        on request_usage_metrics (bucket_start desc)
    `);
    await query(`
      create index if not exists request_usage_metrics_account_idx
        on request_usage_metrics (account_type, account_id, bucket_start desc)
    `);
  })();

  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

function mergeBuckets(target: UsageBucket, source: UsageBucket) {
  target.requestCount += source.requestCount;
  target.loginId = source.loginId;
  target.accountName = source.accountName;
  target.role = source.role;
  target.domainId = source.domainId;
  target.companyId = source.companyId;
}

function restoreBuckets(state: RequestUsageState, buckets: UsageBucket[]) {
  for (const bucket of buckets) {
    const key = getBucketKey(bucket);
    const existing = state.buckets.get(key);

    if (existing) {
      mergeBuckets(existing, bucket);
    } else {
      state.buckets.set(key, bucket);
    }
  }

  recalculateOldestBucketStart(state);
}

async function persistBuckets(buckets: UsageBucket[]) {
  if (buckets.length === 0) {
    return;
  }

  await ensureRequestUsageMetricsSchema();

  const values: unknown[] = [];
  const rows = buckets.map((bucket, index) => {
    const offset = index * 12;

    values.push(
      new Date(bucket.bucketStartMs),
      bucket.source,
      bucket.accountType,
      bucket.accountId,
      bucket.loginId,
      bucket.accountName,
      bucket.role,
      bucket.domainId ?? null,
      bucket.companyId ?? null,
      bucket.route,
      bucket.method,
      bucket.requestCount,
    );

    return `(
      $${offset + 1}::timestamptz,
      $${offset + 2},
      $${offset + 3},
      $${offset + 4},
      $${offset + 5},
      $${offset + 6},
      $${offset + 7},
      $${offset + 8},
      $${offset + 9},
      $${offset + 10},
      $${offset + 11},
      $${offset + 12}::bigint
    )`;
  });

  await query(
    `
      insert into request_usage_metrics (
        bucket_start,
        source,
        account_type,
        account_id,
        login_id,
        account_name,
        role,
        domain_id,
        company_id,
        route,
        method,
        request_count
      )
      values ${rows.join(",")}
      on conflict (
        bucket_start,
        source,
        account_type,
        account_id,
        route,
        method
      )
      do update set
        login_id = excluded.login_id,
        account_name = excluded.account_name,
        role = excluded.role,
        domain_id = excluded.domain_id,
        company_id = excluded.company_id,
        request_count = request_usage_metrics.request_count + excluded.request_count,
        updated_at = now()
    `,
    values,
  );
}

export async function flushRequestUsageMetrics(options?: { includeCurrent?: boolean }) {
  if (!hasDatabaseUrl()) {
    return;
  }

  const state = getState();

  if (state.flushPromise) {
    await state.flushPromise;

    if (options?.includeCurrent) {
      await flushRequestUsageMetrics(options);
    }

    return;
  }

  const currentBucketStartMs = getBucketStartMs();
  const pending: UsageBucket[] = [];

  for (const [key, bucket] of state.buckets) {
    if (options?.includeCurrent || bucket.bucketStartMs < currentBucketStartMs) {
      pending.push(bucket);
      state.buckets.delete(key);
    }
  }

  recalculateOldestBucketStart(state);

  if (pending.length === 0) {
    return;
  }

  state.flushPromise = (async () => {
    try {
      await persistBuckets(pending);

      if (Date.now() - state.lastCleanupAtMs >= 60 * 60 * 1000) {
        await query(
          `delete from request_usage_metrics where bucket_start < now() - ($1::int * interval '1 day')`,
          [retentionDays],
        );
        state.lastCleanupAtMs = Date.now();
      }
    } catch (error) {
      restoreBuckets(state, pending);
      throw error;
    } finally {
      state.flushPromise = null;
    }
  })();

  await state.flushPromise;
}

function scheduleCompletedBucketFlush(state: RequestUsageState, currentBucketStartMs: number) {
  if (
    state.flushPromise ||
    state.flushScheduled ||
    state.oldestBucketStartMs === null ||
    state.oldestBucketStartMs >= currentBucketStartMs
  ) {
    return;
  }

  state.flushScheduled = true;
  after(async () => {
    try {
      await flushRequestUsageMetrics();
    } catch {
      // Measurement failures must never affect production requests.
    } finally {
      state.flushScheduled = false;
    }
  });
}

export function recordRequestUsage(input: {
  request: Request;
  identity: RequestUsageIdentity;
  route?: string;
}) {
  if (!hasDatabaseUrl()) {
    return;
  }

  const state = getState();
  const bucketStartMs = getBucketStartMs();
  const bucket: UsageBucket = {
    ...input.identity,
    bucketStartMs,
    route: normalizeRoute(input.request, input.route),
    method: input.request.method.toUpperCase(),
    requestCount: 1,
  };
  const key = getBucketKey(bucket);
  const existing = state.buckets.get(key);

  if (existing) {
    mergeBuckets(existing, bucket);
  } else {
    state.buckets.set(key, bucket);
  }

  state.oldestBucketStartMs =
    state.oldestBucketStartMs === null
      ? bucketStartMs
      : Math.min(state.oldestBucketStartMs, bucketStartMs);

  scheduleCompletedBucketFlush(state, bucketStartMs);
}

export function getAdminRequestUsageIdentity(user: SessionUser): RequestUsageIdentity {
  return {
    source: "ADMIN_PORTAL",
    accountType: "ADMIN",
    accountId: user.id,
    loginId: user.loginId,
    accountName: user.nickname,
    role: user.role,
    companyId: user.companyId,
  };
}

export function getPartnerRequestUsageIdentity(
  access: PartnerAccessTokenPayload,
): RequestUsageIdentity {
  return {
    source: "PARTNER_API",
    accountType: "DOMAIN",
    accountId: access.domainId,
    loginId: access.loginId,
    accountName: access.partnerName,
    role: access.role,
    domainId: access.domainId,
    companyId: access.partnerId,
  };
}

export function getDomainRequestUsageIdentity(input: {
  domainId?: string | null;
  domainName?: string | null;
  adminId?: string | null;
  loginId?: string | null;
  companyId?: string | null;
  companyName?: string | null;
}): RequestUsageIdentity {
  const domainId = input.domainId?.trim() || null;
  const domainName = input.domainName?.trim() || "도메인 미확인";

  return {
    source: "PARTNER_API",
    accountType: "DOMAIN",
    accountId: domainId ?? `domain-name:${domainName.toLowerCase()}`,
    loginId: input.loginId?.trim() || "-",
    accountName: input.companyName?.trim() || domainName,
    role: "partner_admin",
    domainId,
    companyId: input.companyId?.trim() || null,
  };
}

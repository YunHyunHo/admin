import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  ensureRequestUsageMetricsSchema,
  flushRequestUsageMetrics,
} from "@/lib/request-usage-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UsageMetricRow = {
  source: "ADMIN_PORTAL" | "PARTNER_API";
  account_type: "ADMIN" | "DOMAIN";
  account_id: string;
  login_id: string;
  account_name: string;
  role: string;
  domain_id: string | null;
  company_id: string | null;
  route: string;
  method: string;
  request_count: string;
  active_buckets: number;
  first_seen_at: string;
  last_seen_at: string;
};

function parseHours(value: string | null) {
  const hours = Number(value ?? 24);

  return Number.isInteger(hours) && hours >= 1 && hours <= 168 ? hours : 24;
}

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (user.role !== "MASTER") {
    return NextResponse.json(
      { message: "마스터 계정만 사용량 측정 결과를 확인할 수 있습니다." },
      { status: 403 },
    );
  }

  const hours = parseHours(new URL(request.url).searchParams.get("hours"));

  await ensureRequestUsageMetricsSchema();
  await flushRequestUsageMetrics({ includeCurrent: true });

  const result = await query<UsageMetricRow>(
    `
      select
        source,
        account_type,
        account_id,
        max(login_id) as login_id,
        max(account_name) as account_name,
        max(role) as role,
        max(domain_id) as domain_id,
        max(company_id) as company_id,
        route,
        method,
        sum(request_count)::text as request_count,
        count(distinct bucket_start)::int as active_buckets,
        to_char(min(bucket_start) at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') as first_seen_at,
        to_char(max(bucket_start + interval '5 minutes') at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') as last_seen_at
      from request_usage_metrics
      where bucket_start >= now() - ($1::int * interval '1 hour')
      group by source, account_type, account_id, route, method
      order by sum(request_count) desc, account_name asc, route asc
    `,
    [hours],
  );

  const accountMap = new Map<
    string,
    {
      source: UsageMetricRow["source"];
      accountType: UsageMetricRow["account_type"];
      accountId: string;
      loginId: string;
      accountName: string;
      role: string;
      domainId: string | null;
      companyId: string | null;
      requestCount: number;
      routes: Array<{
        route: string;
        method: string;
        requestCount: number;
        activeBuckets: number;
        firstSeenAt: string;
        lastSeenAt: string;
      }>;
    }
  >();

  for (const row of result.rows) {
    const key = `${row.source}:${row.account_type}:${row.account_id}`;
    const account = accountMap.get(key) ?? {
      source: row.source,
      accountType: row.account_type,
      accountId: row.account_id,
      loginId: row.login_id,
      accountName: row.account_name,
      role: row.role,
      domainId: row.domain_id,
      companyId: row.company_id,
      requestCount: 0,
      routes: [],
    };
    const requestCount = Number(row.request_count);

    account.requestCount += requestCount;
    account.routes.push({
      route: row.route,
      method: row.method,
      requestCount,
      activeBuckets: row.active_buckets,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    });
    accountMap.set(key, account);
  }

  const accounts = [...accountMap.values()].sort(
    (left, right) => right.requestCount - left.requestCount,
  );
  const totalRequests = accounts.reduce(
    (sum, account) => sum + account.requestCount,
    0,
  );

  return NextResponse.json(
    {
      measuredHours: hours,
      retentionDays: 7,
      bucketMinutes: 5,
      totalRequests,
      accounts,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}


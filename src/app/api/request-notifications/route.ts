import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getPendingChargeRequestIds } from "@/lib/charge-requests-repository";
import { getPendingDistributorWithdrawalIds } from "@/lib/distributor-withdrawals-repository";
import { getPendingDomainExchangeIds } from "@/lib/domain-exchanges-repository";
import { hasDatabaseUrl } from "@/lib/db";
import { isLightweightRequestNotificationPilot } from "@/lib/realtime-sync-pilot";
import { getPendingRequestIds } from "@/lib/request-notifications-repository";
import {
  getAdminRequestUsageIdentity,
  recordRequestUsage,
} from "@/lib/request-usage-metrics";
import {
  logAdminRealtimeDiagnostic,
  parseRealtimeClientDiagnostic,
} from "@/lib/realtime-diagnostics";

export const runtime = "nodejs";

function parseDiagnosticHeader(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const diagnosticValue = parseDiagnosticHeader(
    request.headers.get("x-realtime-diagnostic"),
  );
  const diagnostic = parseRealtimeClientDiagnostic(diagnosticValue);
  await logAdminRealtimeDiagnostic({
    request,
    user,
    event: "notification-snapshot-requested",
    client: {
      ...diagnostic,
      buildVersion: diagnostic.buildVersion ?? "missing-client-build",
    },
  });

  recordRequestUsage({
    request,
    identity: getAdminRequestUsageIdentity(user),
  });

  const pendingIds =
    hasDatabaseUrl() && isLightweightRequestNotificationPilot(user)
      ? await getPendingRequestIds(user)
      : await Promise.all([
          getPendingChargeRequestIds(user),
          getPendingDomainExchangeIds(user),
          getPendingDistributorWithdrawalIds(user),
        ]).then(([charges, domainExchanges, distributorWithdrawals]) => ({
          charges,
          domainExchanges,
          distributorWithdrawals,
        }));

  return NextResponse.json(
    {
      pendingIds,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getPendingChargeRequestIds } from "@/lib/charge-requests-repository";
import { getPendingDistributorWithdrawalIds } from "@/lib/distributor-withdrawals-repository";
import { getPendingDomainExchangeIds } from "@/lib/domain-exchanges-repository";
import { hasDatabaseUrl } from "@/lib/db";
import { isLightweightRequestNotificationPilot } from "@/lib/realtime-sync-pilot";
import { getPendingRequestIds } from "@/lib/request-notifications-repository";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

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

import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getPendingChargeRequestIds } from "@/lib/charge-requests-repository";
import { getPendingDistributorWithdrawalIds } from "@/lib/distributor-withdrawals-repository";
import { getPendingDomainExchangeIds } from "@/lib/domain-exchanges-repository";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const [charges, domainExchanges, distributorWithdrawals] = await Promise.all([
    getPendingChargeRequestIds(user),
    getPendingDomainExchangeIds(user),
    getPendingDistributorWithdrawalIds(user),
  ]);

  return NextResponse.json(
    {
      pendingIds: {
        charges,
        domainExchanges,
        distributorWithdrawals,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

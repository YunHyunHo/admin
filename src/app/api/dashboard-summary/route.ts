import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  getDashboardPartnerSummariesForUser,
  getDashboardSummaryForUser,
  sortDashboardPartnerSummaries,
} from "@/lib/dashboard-summary-repository";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const [summary, partnerSummaries] = await Promise.all([
    getDashboardSummaryForUser(user),
    getDashboardPartnerSummariesForUser(user),
  ]);

  return NextResponse.json({
    ...summary,
    partnerSummaries: sortDashboardPartnerSummaries(partnerSummaries),
  });
}

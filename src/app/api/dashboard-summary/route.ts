import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getMockChargeStateFromCookie } from "@/lib/mock-state-cookie";
import { getDashboardSummary } from "@/lib/mock-report-service";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const state = await getMockChargeStateFromCookie();

  return NextResponse.json(getDashboardSummary(user.companyName, state));
}

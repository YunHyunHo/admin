import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getMockChargeStateFromCookie } from "@/lib/mock-state-cookie";
import { getDomainSettlement } from "@/lib/mock-report-service";

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { message: "조회 시작일과 종료일이 필요합니다." },
      { status: 400 },
    );
  }

  const state = await getMockChargeStateFromCookie();

  return NextResponse.json(
    getDomainSettlement(user.companyName, startDate, endDate, state),
  );
}

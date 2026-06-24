import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  getDashboardPartnerSummariesForUser,
  getDashboardSummaryForUser,
  saveDashboardPartnerSummaryOrder,
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

export async function PATCH(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (user.role !== "MASTER") {
    return NextResponse.json(
      { message: "마스터 계정만 업체 순번을 변경할 수 있습니다." },
      { status: 403 },
    );
  }

  const payload = (await request.json().catch(() => null)) as {
    orderedIds?: string[];
  } | null;

  if (!Array.isArray(payload?.orderedIds) || !payload.orderedIds.length) {
    return NextResponse.json(
      { message: "저장할 업체 순서를 확인해주세요." },
      { status: 400 },
    );
  }

  try {
    await saveDashboardPartnerSummaryOrder(user, payload.orderedIds);
    const partnerSummaries = sortDashboardPartnerSummaries(
      await getDashboardPartnerSummariesForUser(user),
    );

    return NextResponse.json({ ok: true, partnerSummaries });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "업체 순번 저장 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}

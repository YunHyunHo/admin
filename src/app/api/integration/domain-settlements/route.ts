import { NextResponse } from "next/server";

import { getIntegrationDomainSettlementHistory } from "@/lib/integration-domain-history";
import { getPartnerAccess } from "@/lib/partner-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const partnerAccess = getPartnerAccess(request);

  if (partnerAccess.provided && !partnerAccess.access) {
    return NextResponse.json(
      { ok: false, message: "유효하지 않거나 만료된 로그인 토큰입니다." },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json(
      await getIntegrationDomainSettlementHistory({
        domainId: partnerAccess.access?.domainId ?? searchParams.get("domainId"),
        domainName: partnerAccess.access ? null : searchParams.get("domainName"),
        from: searchParams.get("from"),
        to: searchParams.get("to"),
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "도메인 정산내역 조회 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}

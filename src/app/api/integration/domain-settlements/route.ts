import { NextResponse } from "next/server";

import { getIntegrationDomainSettlementHistory } from "@/lib/integration-domain-history";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    return NextResponse.json(
      await getIntegrationDomainSettlementHistory({
        domainId: searchParams.get("domainId"),
        domainName: searchParams.get("domainName"),
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

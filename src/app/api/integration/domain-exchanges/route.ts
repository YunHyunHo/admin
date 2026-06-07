import { NextResponse } from "next/server";

import { getIntegrationDomainExchangeHistory } from "@/lib/integration-domain-history";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    return NextResponse.json(
      await getIntegrationDomainExchangeHistory({
        domainId: searchParams.get("domainId"),
        domainName: searchParams.get("domainName"),
        page: searchParams.get("page"),
        pageSize: searchParams.get("pageSize"),
        from: searchParams.get("from"),
        to: searchParams.get("to"),
        status: searchParams.get("status"),
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "도메인환전 내역 조회 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}

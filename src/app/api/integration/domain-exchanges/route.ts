import { NextResponse } from "next/server";

import { createIntegrationDomainExchange } from "@/lib/domain-exchanges-repository";
import { getIntegrationDomainExchangeHistory } from "@/lib/integration-domain-history";
import { getPartnerAccess } from "@/lib/partner-auth";

export const runtime = "nodejs";

type IntegrationDomainExchangePayload = {
  externalId?: string;
  domainId?: string;
  domainName?: string;
  userId?: string;
  amount?: number;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
};

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
      await getIntegrationDomainExchangeHistory({
        domainId: partnerAccess.access?.domainId ?? searchParams.get("domainId"),
        domainName: partnerAccess.access ? null : searchParams.get("domainName"),
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

export async function POST(request: Request) {
  const payload = (await request.json()) as IntegrationDomainExchangePayload;
  const partnerAccess = getPartnerAccess(request);

  if (partnerAccess.provided && !partnerAccess.access) {
    return NextResponse.json(
      { ok: false, message: "유효하지 않거나 만료된 로그인 토큰입니다." },
      { status: 401 },
    );
  }

  const domainId = partnerAccess.access?.domainId ?? payload.domainId?.trim();
  const domainName = partnerAccess.access ? undefined : payload.domainName?.trim();
  const userId = payload.userId?.trim() ?? "";
  const amount = Number(payload.amount);
  const bankName = payload.bankName?.trim() ?? "";
  const accountHolder = payload.accountHolder?.trim() ?? "";
  const accountNumber = payload.accountNumber?.trim() ?? "";

  if (!domainId && !domainName) {
    return NextResponse.json(
      { ok: false, message: "연동 도메인 정보를 확인해주세요." },
      { status: 400 },
    );
  }

  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { ok: false, message: "신청자와 환전금액을 확인해주세요." },
      { status: 400 },
    );
  }

  try {
    const requestId = await createIntegrationDomainExchange({
      externalId: payload.externalId,
      domainId,
      domainName,
      userId,
      amount,
      bankName,
      accountHolder,
      accountNumber,
      rawPayload: payload,
    });

    return NextResponse.json(
      {
        ok: true,
        requestId,
        status: "PENDING",
        message: "도메인 환전신청이 관리자에 전송되었습니다.",
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "도메인 환전신청 전송 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}

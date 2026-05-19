import { NextResponse } from "next/server";

import {
  createIntegrationChargeRequest,
  getIntegrationChargeDomainOptions,
} from "@/lib/charge-requests-repository";
import { hasDatabaseUrl } from "@/lib/db";

export const runtime = "nodejs";

type IntegrationChargePayload = {
  externalId?: string;
  domainName?: string;
  depositorName?: string;
  amount?: number;
  bankName?: string;
  accountNumber?: string;
};

export async function GET() {
  return NextResponse.json({
    domains: await getIntegrationChargeDomainOptions(),
  });
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { message: "DB 연결 환경에서만 연동 API를 사용할 수 있습니다." },
      { status: 400 },
    );
  }

  const payload = (await request.json()) as IntegrationChargePayload;
  const domainName = payload.domainName?.trim();
  const depositorName = payload.depositorName?.trim() ?? "";
  const amount = Number(payload.amount);
  const bankName = payload.bankName?.trim() ?? "";
  const accountNumber = payload.accountNumber?.trim() ?? "";

  if (!domainName) {
    return NextResponse.json(
      { message: "연동 도메인명을 확인해주세요." },
      { status: 400 },
    );
  }

  if (!depositorName || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { message: "입금자명과 신청금액을 확인해주세요." },
      { status: 400 },
    );
  }

  try {
    const requestId = await createIntegrationChargeRequest({
      externalId: payload.externalId,
      userId: depositorName,
      depositor: depositorName,
      amount,
      bankName,
      accountNumber,
      domainName,
      rawPayload: payload,
    });

    return NextResponse.json(
      {
        ok: true,
        requestId,
        status: "PENDING",
        message: "충전신청이 관리자에 전송되었습니다.",
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "충전신청 전송 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}

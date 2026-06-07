import { NextResponse } from "next/server";

import {
  createIntegrationChargeRequest,
  getIntegrationChargeDomainOptions,
} from "@/lib/charge-requests-repository";
import { hasDatabaseUrl } from "@/lib/db";
import { getIntegrationChargeHistory } from "@/lib/integration-domain-history";

export const runtime = "nodejs";

type IntegrationChargePayload = {
  externalId?: string;
  domainId?: string;
  domainName?: string;
  depositorName?: string;
  amount?: number;
  bankName?: string;
  accountNumber?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domainId = searchParams.get("domainId");
  const domainName = searchParams.get("domainName");

  if (domainId || domainName) {
    try {
      return NextResponse.json(
        await getIntegrationChargeHistory({
          domainId,
          domainName,
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
              : "충전신청 내역 조회 중 오류가 발생했습니다.",
        },
        { status: 400 },
      );
    }
  }

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
  const domainId = payload.domainId?.trim();
  const domainName = payload.domainName?.trim();
  const depositorName = payload.depositorName?.trim() ?? "";
  const amount = Number(payload.amount);
  const bankName = payload.bankName?.trim() ?? "";
  const accountNumber = payload.accountNumber?.trim() ?? "";

  if (!domainId && !domainName) {
    return NextResponse.json(
      { message: "연동 도메인 정보를 확인해주세요." },
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
      domainId,
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

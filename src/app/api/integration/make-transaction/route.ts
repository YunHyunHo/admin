import { NextResponse } from "next/server";

import {
  createIntegrationChargeRequest,
  getIntegrationChargeRequestAccount,
} from "@/lib/charge-requests-repository";
import { hasDatabaseUrl } from "@/lib/db";
import { resolveDomainChargeIntegration } from "@/lib/domain-charge-integration";

export const runtime = "nodejs";

type MakeTransactionPayload = {
  externalId?: string;
  id?: string;
  coinCount?: number;
  bankHolderName?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { code: 2, message: "Database connection is unavailable" },
      { status: 503 },
    );
  }

  let payload: MakeTransactionPayload;

  try {
    payload = (await request.json()) as MakeTransactionPayload;
  } catch {
    return NextResponse.json(
      { code: 1, message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const apiKey = request.headers.get("x-api-key")?.trim() ?? "";
  const integration = apiKey
    ? await resolveDomainChargeIntegration(apiKey)
    : null;

  if (!integration) {
    return NextResponse.json(
      { code: 1, message: "Invalid or inactive API key" },
      { status: 401 },
    );
  }

  if (integration.masterLoginId.trim().toLowerCase() !== "maple") {
    return NextResponse.json(
      { code: 1, message: "Pilot API is limited to the maple account" },
      { status: 403 },
    );
  }

  const externalId = payload.externalId?.trim() ?? "";
  const userId = payload.id?.trim() ?? "";
  const depositorName = payload.bankHolderName?.trim() ?? "";
  const coinCount = Number(payload.coinCount);
  const amount = coinCount * 10_000;

  if (!isUuid(externalId)) {
    return NextResponse.json(
      { code: 1, message: "externalId must be a UUID" },
      { status: 400 },
    );
  }

  if (
    !userId ||
    !depositorName ||
    !Number.isInteger(coinCount) ||
    coinCount <= 0 ||
    !Number.isSafeInteger(amount)
  ) {
    return NextResponse.json(
      { code: 1, message: "Check id, coinCount and bankHolderName" },
      { status: 400 },
    );
  }

  try {
    const result = await createIntegrationChargeRequest({
      externalId,
      userId,
      depositor: depositorName,
      amount,
      domainId: integration.domainId,
      distributorId: integration.distributorId,
      rawPayload: {
        externalId,
        id: userId,
        coinCount,
        bankHolderName: depositorName,
      },
      useLinkedDepositAccount: true,
    });
    const account = await getIntegrationChargeRequestAccount(
      result.requestId,
      integration.domainId,
    );

    if (!account) {
      throw new Error("충전신청 계좌정보를 확인하지 못했습니다.");
    }

    return NextResponse.json(
      {
        code: 0,
        message: result.duplicate
          ? "Transaction already exists"
          : "Transaction created successfully",
        result: {
          request_id: result.requestId,
          external_id: externalId,
          bank_name: account.bankName,
          bank_holder: account.accountHolder,
          bank_account: account.accountNumber,
          price: amount,
          coin_amount: coinCount,
          status: result.status.toLowerCase(),
          coin_symbol: "MAN",
          duplicate: result.duplicate,
        },
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        code: 2,
        message:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      { status: 400 },
    );
  }
}

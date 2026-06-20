import { NextResponse } from "next/server";

import {
  createIntegrationChargeRequest,
} from "@/lib/charge-requests-repository";
import { hasDatabaseUrl } from "@/lib/db";
import {
  getDomainChargeModeByIdentifier,
  resolveDomainChargeIntegration,
} from "@/lib/domain-charge-integration";
import { getIntegrationChargeHistory } from "@/lib/integration-domain-history";
import { verifyPartnerAccessToken } from "@/lib/partner-auth";

export const runtime = "nodejs";

type IntegrationChargePayload = {
  externalId?: string;
  domainId?: string;
  domainName?: string;
  depositorName?: string;
  amount?: number;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
};

const minimumChargeAmount = 10000;

function isUuid(value: string | undefined) {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  );
}

function getPartnerAccess(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";

  if (!authorization) {
    return { provided: false, access: null };
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  const access =
    scheme?.toLowerCase() === "bearer" && token
      ? verifyPartnerAccessToken(token)
      : null;

  return { provided: true, access };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const partnerAccess = getPartnerAccess(request);

  if (partnerAccess.provided && !partnerAccess.access) {
    return NextResponse.json(
      { ok: false, message: "유효하지 않거나 만료된 로그인 토큰입니다." },
      { status: 401 },
    );
  }

  const domainId =
    partnerAccess.access?.domainId ?? searchParams.get("domainId");
  const domainName = partnerAccess.access
    ? null
    : searchParams.get("domainName");

  if (domainId || domainName) {
    try {
      if (
        !partnerAccess.access &&
        (await getDomainChargeModeByIdentifier({ domainId, domainName })) ===
          "API"
      ) {
        return NextResponse.json(
          { ok: false, message: "구매내역 조회에는 로그인 토큰이 필요합니다." },
          { status: 401 },
        );
      }

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

  return NextResponse.json(
    { ok: false, message: "조회할 도메인 정보가 필요합니다." },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { ok: false, message: "DB 연결 환경에서만 연동 API를 사용할 수 있습니다." },
      { status: 400 },
    );
  }

  let payload: IntegrationChargePayload;

  try {
    payload = (await request.json()) as IntegrationChargePayload;
  } catch {
    return NextResponse.json(
      { ok: false, message: "요청 본문은 올바른 JSON 형식이어야 합니다." },
      { status: 400 },
    );
  }
  const apiKey = request.headers.get("x-api-key")?.trim() ?? "";
  const partnerAccess = getPartnerAccess(request);

  if (partnerAccess.provided && !partnerAccess.access) {
    return NextResponse.json(
      { ok: false, message: "유효하지 않거나 만료된 로그인 토큰입니다." },
      { status: 401 },
    );
  }

  const integration = apiKey
    ? await resolveDomainChargeIntegration(apiKey)
    : null;
  const domainId =
    integration?.domainId ??
    partnerAccess.access?.domainId ??
    payload.domainId?.trim();
  const domainName =
    integration || partnerAccess.access ? undefined : payload.domainName?.trim();
  const depositorName = payload.depositorName?.trim() ?? "";
  const amount = Number(payload.amount);
  const bankName = payload.bankName?.trim() ?? "";
  const accountHolder = payload.accountHolder?.trim() ?? "";
  const accountNumber = payload.accountNumber?.trim() ?? "";
  const providedAccountFieldCount = [
    bankName,
    accountHolder,
    accountNumber,
  ].filter(Boolean).length;
  const hasProvidedAccount = providedAccountFieldCount === 3;

  if (apiKey && !integration) {
    return NextResponse.json(
      { ok: false, message: "유효하지 않거나 중지된 API 키입니다." },
      { status: 401 },
    );
  }

  if (
    !apiKey &&
    !partnerAccess.access &&
    !payload.domainId?.trim() &&
    !payload.domainName?.trim()
  ) {
    return NextResponse.json(
      { ok: false, message: "외부 연동 요청에는 X-API-Key가 필요합니다." },
      { status: 401 },
    );
  }

  if (!domainId && !domainName) {
    return NextResponse.json(
      { ok: false, message: "연동 도메인 정보를 확인해주세요." },
      { status: 400 },
    );
  }

  if (domainId && !isUuid(domainId)) {
    return NextResponse.json(
      { ok: false, message: "도메인 ID 형식을 확인해주세요." },
      { status: 400 },
    );
  }

  if (
    !integration &&
    (await getDomainChargeModeByIdentifier({ domainId, domainName })) === "API"
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: "API 연동 도메인은 발급된 API 키로만 충전신청을 접수할 수 있습니다.",
      },
      { status: 403 },
    );
  }

  if (
    !depositorName ||
    !Number.isInteger(amount) ||
    amount < minimumChargeAmount
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: "입금자명과 1만원 이상의 충전금액을 확인해주세요.",
      },
      { status: 400 },
    );
  }

  if (providedAccountFieldCount > 0 && !hasProvidedAccount) {
    return NextResponse.json(
      {
        ok: false,
        message: "은행, 예금주, 계좌번호는 모두 함께 보내주세요.",
      },
      { status: 400 },
    );
  }

  if (integration && !isUuid(payload.externalId?.trim())) {
    return NextResponse.json(
      { ok: false, message: "externalId는 요청마다 생성한 UUID여야 합니다." },
      { status: 400 },
    );
  }

  try {
    const result = await createIntegrationChargeRequest({
      externalId: payload.externalId?.trim(),
      userId: integration?.domainAdminLoginId ?? depositorName,
      depositor: depositorName,
      amount,
      bankName,
      accountHolder,
      accountNumber,
      domainId,
      domainName,
      rawPayload: payload,
      useDomainWithdrawAccount: Boolean(integration) && !hasProvidedAccount,
    });

    return NextResponse.json(
      {
        ok: true,
        requestId: result.requestId,
        externalId: payload.externalId?.trim() ?? null,
        status: result.status,
        duplicate: result.duplicate,
        message: result.duplicate
          ? "이미 접수된 충전신청입니다. 기존 신청 정보를 반환합니다."
          : "충전신청이 관리자에 전송되었습니다.",
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "충전신청 전송 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}

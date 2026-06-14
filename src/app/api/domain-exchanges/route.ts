import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  approveDomainExchange,
  cancelApprovedDomainExchange,
  createDomainExchange,
  getDomainExchangeCreateContext,
  getDomainExchangeRows,
  rejectDomainExchange,
} from "@/lib/domain-exchanges-repository";
import { hasDatabaseUrl } from "@/lib/db";
import { canManageMasterResources, canUseDistributorMenus } from "@/lib/permissions";

export const runtime = "nodejs";

type PatchDomainExchangePayload = {
  id?: string;
  action?: "approve" | "reject" | "cancel";
};

type CreateDomainExchangePayload = {
  action?: "create";
  externalId?: string;
  amount?: number;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  domainId?: string;
};

function isUuid(value: string | undefined) {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  );
}

function isPatchAction(value: string | undefined): value is NonNullable<PatchDomainExchangePayload["action"]> {
  return value === "approve" || value === "reject" || value === "cancel";
}

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json({
    rows: await getDomainExchangeRows([], user),
    createContext: canUseDistributorMenus(user)
      ? await getDomainExchangeCreateContext(user)
      : {
          defaultDomainId: null,
          currentBalance: 0,
          hasConnectedDomain: false,
        },
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!canUseDistributorMenus(user)) {
    return NextResponse.json(
      { message: "환전 요청을 생성할 권한이 없습니다." },
      { status: 403 },
    );
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { message: "DB 연결 환경에서만 환전신청 생성 API를 사용할 수 있습니다." },
      { status: 400 },
    );
  }

  const payload = (await request.json()) as CreateDomainExchangePayload;
  const domainId = payload.domainId?.trim();
  const amount = Number(payload.amount);
  if (domainId && !isUuid(domainId)) {
    return NextResponse.json(
      { message: "도메인 정보를 확인해주세요." },
      { status: 400 },
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { message: "환전금액을 확인해주세요." },
      { status: 400 },
    );
  }

  try {
    await createDomainExchange({
      externalId: payload.externalId,
      userId: user.loginId,
      amount,
      bankName: payload.bankName,
      accountHolder: payload.accountHolder,
      accountNumber: payload.accountNumber,
      domainId: domainId ?? null,
      rawPayload: payload,
      user,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "환전신청 생성 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      rows: await getDomainExchangeRows([], user),
      message: "환전신청이 생성되었습니다.",
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!canManageMasterResources(user)) {
    return NextResponse.json(
      { message: "환전 요청을 처리할 권한이 없습니다." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as PatchDomainExchangePayload;

  if (!payload.id || !payload.action) {
    return NextResponse.json(
      { message: "처리할 환전 요청 정보가 없습니다." },
      { status: 400 },
    );
  }

  if (!isPatchAction(payload.action)) {
    return NextResponse.json(
      { message: "지원하지 않는 환전 요청 처리입니다." },
      { status: 400 },
    );
  }

  if (hasDatabaseUrl()) {
    if (!isUuid(payload.id)) {
      return NextResponse.json(
        { message: "환전 요청 정보를 확인해주세요." },
        { status: 400 },
      );
    }

    try {
      if (payload.action === "approve") {
        await approveDomainExchange(payload.id, user.id);
      } else if (payload.action === "reject") {
        await rejectDomainExchange(payload.id, user.id);
      } else {
        await cancelApprovedDomainExchange(payload.id, user.id);
      }
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "환전 요청 처리 중 오류가 발생했습니다.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      rows: await getDomainExchangeRows([], user),
      message:
        payload.action === "approve"
          ? "환전 요청이 승인되었습니다."
          : payload.action === "reject"
            ? "환전 요청이 거절되었습니다."
            : "환전 요청이 승인취소되었습니다.",
    });
  }

  return NextResponse.json({
    message:
      payload.action === "approve"
        ? "환전 요청이 승인되었습니다."
        : payload.action === "reject"
          ? "환전 요청이 거절되었습니다."
          : "환전 요청이 승인취소되었습니다.",
  });
}

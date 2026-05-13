import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  approveDomainExchange,
  createDomainExchange,
  getDomainExchangeRows,
  rejectDomainExchange,
} from "@/lib/domain-exchanges-repository";
import { hasDatabaseUrl } from "@/lib/db";
import { canManageMasterResources } from "@/lib/permissions";

export const runtime = "nodejs";

type PatchDomainExchangePayload = {
  id?: string;
  action?: "approve" | "reject";
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

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json({ rows: await getDomainExchangeRows([], user) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (user.role !== "ADMIN") {
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
      domainId,
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

  if (hasDatabaseUrl()) {
    if (!isUuid(payload.id)) {
      return NextResponse.json(
        { message: "환전 요청 정보를 확인해주세요." },
        { status: 400 },
      );
    }

    if (payload.action === "approve") {
      await approveDomainExchange(payload.id, user.id);
    } else {
      await rejectDomainExchange(payload.id, user.id);
    }

    return NextResponse.json({
      rows: await getDomainExchangeRows([], user),
      message:
        payload.action === "approve"
          ? "환전 요청이 승인되었습니다."
          : "환전 요청이 거절되었습니다.",
    });
  }

  return NextResponse.json({
    message:
      payload.action === "approve"
        ? "환전 요청이 승인되었습니다."
        : "환전 요청이 거절되었습니다.",
  });
}

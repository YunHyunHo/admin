import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { hasDatabaseUrl } from "@/lib/db";
import {
  approveDistributorWithdrawal,
  cancelDistributorWithdrawal,
  createDistributorWithdrawal,
  getDistributorWithdrawalRows,
  rejectDistributorWithdrawal,
} from "@/lib/distributor-withdrawals-repository";
import { canManageMasterResources, canUseDistributorMenus } from "@/lib/permissions";

export const runtime = "nodejs";

type CreateDistributorWithdrawalPayload = {
  amount?: number;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
};

type PatchDistributorWithdrawalPayload = {
  id?: string;
  action?: "approve" | "reject" | "cancel";
};

function isUuid(value: string | undefined) {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  );
}

function isPatchAction(value: string | undefined): value is NonNullable<PatchDistributorWithdrawalPayload["action"]> {
  return value === "approve" || value === "reject" || value === "cancel";
}

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json({
    rows: await getDistributorWithdrawalRows([], user),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!canUseDistributorMenus(user)) {
    return NextResponse.json(
      { message: "총판 환전 신청 권한이 없습니다." },
      { status: 403 },
    );
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { message: "DB 연결 환경에서만 총판 환전 신청 API를 사용할 수 있습니다." },
      { status: 400 },
    );
  }

  const payload = (await request.json()) as CreateDistributorWithdrawalPayload;
  const amount = Number(payload.amount);
  const bankName = payload.bankName?.trim() ?? "";
  const accountHolder = payload.accountHolder?.trim() ?? "";
  const accountNumber = payload.accountNumber?.trim() ?? "";

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { message: "환전금액을 확인해주세요." },
      { status: 400 },
    );
  }

  if (!bankName || !accountHolder || !accountNumber) {
    return NextResponse.json(
      { message: "출금은행, 예금주, 계좌번호를 모두 입력해주세요." },
      { status: 400 },
    );
  }

  try {
    await createDistributorWithdrawal({
      amount,
      bankName,
      accountHolder,
      accountNumber,
      user,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "총판 환전 신청 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      rows: await getDistributorWithdrawalRows([], user),
      message: "총판 환전 신청이 생성되었습니다.",
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
      { message: "총판 환전 요청을 처리할 권한이 없습니다." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as PatchDistributorWithdrawalPayload;

  if (!payload.id || !payload.action || !isUuid(payload.id)) {
    return NextResponse.json(
      { message: "처리할 총판 환전 요청 정보를 확인해주세요." },
      { status: 400 },
    );
  }

  if (!isPatchAction(payload.action)) {
    return NextResponse.json(
      { message: "지원하지 않는 총판 환전 요청 처리입니다." },
      { status: 400 },
    );
  }

  try {
    if (payload.action === "approve") {
      await approveDistributorWithdrawal(payload.id, user);
    } else if (payload.action === "reject") {
      await rejectDistributorWithdrawal(payload.id, user);
    } else {
      await cancelDistributorWithdrawal(payload.id, user);
    }
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "총판 환전 요청 처리 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    rows: await getDistributorWithdrawalRows([], user),
    message:
      payload.action === "approve"
        ? "총판 환전 요청이 승인되었습니다."
        : payload.action === "reject"
          ? "총판 환전 요청이 거절되었습니다."
          : "총판 환전 요청이 승인취소되었습니다.",
  });
}

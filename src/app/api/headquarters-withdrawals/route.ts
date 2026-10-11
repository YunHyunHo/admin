import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  createHeadquartersWithdrawal,
  getHeadquartersAccountSnapshot,
  processHeadquartersWithdrawal,
} from "@/lib/headquarters-withdrawals-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (user.role !== "MASTER") {
    return NextResponse.json({ message: "본사 잔액 조회 권한이 없습니다." }, { status: 403 });
  }

  return NextResponse.json(await getHeadquartersAccountSnapshot(user), {
    headers: { "Cache-Control": "no-store" },
  });
}

type CreatePayload = {
  amount?: number;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
};

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (user.role !== "MASTER") {
    return NextResponse.json({ message: "본사 환전 권한이 없습니다." }, { status: 403 });
  }

  const payload = (await request.json()) as CreatePayload;
  const amount = Number(payload.amount);
  const bankName = payload.bankName?.trim() ?? "";
  const accountHolder = payload.accountHolder?.trim() ?? "";
  const accountNumber = payload.accountNumber?.trim() ?? "";

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return NextResponse.json({ message: "환전금액을 확인해주세요." }, { status: 400 });
  }

  try {
    const snapshot = await createHeadquartersWithdrawal({
      user,
      amount,
      bankName,
      accountHolder,
      accountNumber,
    });

    return NextResponse.json(
      { ...snapshot, message: "본사 환전 신청이 생성되었습니다." },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "본사 환전 처리 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}

type PatchPayload = {
  id?: string;
  action?: "approve" | "reject" | "cancel";
};

export async function PATCH(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (user.role !== "MASTER") {
    return NextResponse.json({ message: "본사 환전 처리 권한이 없습니다." }, { status: 403 });
  }

  const payload = (await request.json()) as PatchPayload;

  if (
    !payload.id?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) ||
    !payload.action ||
    !["approve", "reject", "cancel"].includes(payload.action)
  ) {
    return NextResponse.json({ message: "처리할 본사 환전 정보를 확인해주세요." }, { status: 400 });
  }

  try {
    const snapshot = await processHeadquartersWithdrawal(payload.id, payload.action, user);
    const actionMessage =
      payload.action === "approve" ? "승인" : payload.action === "reject" ? "거절" : "승인취소";

    return NextResponse.json({ ...snapshot, message: `본사 환전 신청이 ${actionMessage}되었습니다.` });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "본사 환전 처리 중 오류가 발생했습니다." },
      { status: 400 },
    );
  }
}

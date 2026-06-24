import { NextResponse } from "next/server";

import {
  createBankAccount,
  deleteBankAccount,
  getBankAccountBoardData,
  unlinkDomainFromBankAccount,
  updateBankAccount,
} from "@/lib/bank-accounts-repository";
import { getSessionUser } from "@/lib/auth";
import { hasDatabaseUrl } from "@/lib/db";

export const runtime = "nodejs";

type CreateAccountPayload = {
  bankName?: string;
  holder?: string;
  accountNumber?: string;
};

type PatchAccountPayload = {
  id?: string;
  action?: "update" | "toggle-active" | "delete" | "unlink-domain";
  domainId?: string;
  bankName?: string;
  holder?: string;
  accountNumber?: string;
  isActive?: boolean;
};

function isWritableRole(role: string | undefined) {
  return role === "MASTER" || role === "DOMAIN_ADMIN";
}

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

  return NextResponse.json(await getBankAccountBoardData(user));
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user || !isWritableRole(user.role)) {
    return NextResponse.json(
      { message: "계좌를 생성할 권한이 없습니다." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as CreateAccountPayload;
  const bankName = payload.bankName?.trim() ?? "";
  const holder = payload.holder?.trim() ?? "";
  const accountNumber = payload.accountNumber?.trim() ?? "";

  if (!bankName || !holder || !accountNumber) {
    return NextResponse.json(
      { message: "은행, 예금주, 계좌번호를 모두 입력해주세요." },
      { status: 400 },
    );
  }

  if (hasDatabaseUrl()) {
    try {
      await createBankAccount(
        {
          bankName,
          holder,
          accountNumber,
        },
        user,
      );
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "계좌 생성 중 오류가 발생했습니다.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ...(await getBankAccountBoardData(user)),
      message: "계좌가 생성되었습니다.",
    });
  }

  return NextResponse.json({
    account: {
      id: `ACC-${Date.now().toString().slice(-6)}`,
      branchName: "본사",
      creator: user.nickname,
      bankName,
      holder,
      accountNumber,
      createdAt: "-",
      isActive: true,
      linkedDomains: [],
    },
    message: "계좌가 생성되었습니다.",
  });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();

  if (!user || !isWritableRole(user.role)) {
    return NextResponse.json(
      { message: "계좌를 수정할 권한이 없습니다." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as PatchAccountPayload;

  if (!payload.id || !payload.action) {
    return NextResponse.json(
      { message: "수정할 계좌 정보가 없습니다." },
      { status: 400 },
    );
  }

  if (hasDatabaseUrl()) {
    if (!isUuid(payload.id)) {
      return NextResponse.json(
        { message: "계좌 정보를 확인해주세요." },
        { status: 400 },
      );
    }

    if (payload.action === "delete") {
      await deleteBankAccount(payload.id, user);
    } else if (payload.action === "unlink-domain") {
      if (!isUuid(payload.domainId)) {
        return NextResponse.json(
          { message: "해제할 도메인 정보를 확인해주세요." },
          { status: 400 },
        );
      }

      await unlinkDomainFromBankAccount({
        accountId: payload.id,
        domainId: payload.domainId!,
        user,
      });
    } else {
      const bankName = payload.bankName?.trim();
      const holder = payload.holder?.trim();
      const accountNumber = payload.accountNumber?.trim();

      if (
        payload.action === "update" &&
        (!bankName || !holder || !accountNumber)
      ) {
        return NextResponse.json(
          { message: "은행, 예금주, 계좌번호를 모두 입력해주세요." },
          { status: 400 },
        );
      }

      await updateBankAccount({
        id: payload.id,
        bankName: payload.action === "update" ? bankName : undefined,
        holder: payload.action === "update" ? holder : undefined,
        accountNumber:
          payload.action === "update" ? accountNumber : undefined,
        isActive:
          payload.action === "toggle-active" ? Boolean(payload.isActive) : undefined,
        user,
      });
    }

    return NextResponse.json({
      ...(await getBankAccountBoardData(user)),
      message:
        payload.action === "delete"
          ? "계좌가 삭제되었습니다."
          : payload.action === "unlink-domain"
            ? "도메인 계좌 연동이 해제되었습니다."
          : "계좌가 수정되었습니다.",
    });
  }

  return NextResponse.json({ message: "계좌가 수정되었습니다." });
}

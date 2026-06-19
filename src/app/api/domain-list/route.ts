import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { adjustDomainBalance } from "@/lib/domain-management-repository";
import {
  createDomainEntry,
  deleteDomainEntry,
  getDomainListBoardData,
  linkDomainEntryAccount,
  updateDomainEntryAccount,
  updateDomainWithdrawAccount,
  updateDomainEntryStatus,
} from "@/lib/domain-list-repository";

export const runtime = "nodejs";

type CreateDomainEntryPayload = {
  ownerDistributorId?: string;
  url?: string;
  domainName?: string;
  loginId?: string;
  password?: string;
  confirmPassword?: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
};

type PatchDomainEntryPayload = {
  id?: string;
  action?:
    | "toggle-status"
    | "delete"
    | "update-account"
    | "update-withdraw-account"
    | "link-account"
    | "adjust-balance";
  depositEnabled?: boolean;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  accountId?: string;
  balanceDirection?: "increase" | "decrease";
  amount?: number;
};

function canWrite(role: string | undefined) {
  return role === "MASTER" || role === "DOMAIN_ADMIN";
}

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!canWrite(user.role)) {
    return NextResponse.json(
      { message: "도메인 리스트를 조회할 권한이 없습니다." },
      { status: 403 },
    );
  }

  return NextResponse.json(await getDomainListBoardData(user));
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user || !canWrite(user.role)) {
    return NextResponse.json(
      { message: "도메인을 생성할 권한이 없습니다." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as CreateDomainEntryPayload;

  if ((payload.password ?? "") !== (payload.confirmPassword ?? "")) {
    return NextResponse.json(
      { message: "비밀번호 확인이 일치하지 않습니다." },
      { status: 400 },
    );
  }

  try {
    await createDomainEntry({
      ownerDistributorId: payload.ownerDistributorId?.trim() ?? "",
      url: payload.url?.trim() ?? "",
      domainName: payload.domainName?.trim() ?? "",
      loginId: payload.loginId?.trim() ?? "",
      password: payload.password ?? "",
      bankName: payload.bankName?.trim() ?? "",
      accountHolder: payload.accountHolder?.trim() ?? "",
      accountNumber: payload.accountNumber?.trim() ?? "",
      createdById: user.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "도메인 생성 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ...(await getDomainListBoardData(user)),
    message: "도메인이 생성되었습니다.",
  });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();

  if (!user || !canWrite(user.role)) {
    return NextResponse.json(
      { message: "도메인을 수정할 권한이 없습니다." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as PatchDomainEntryPayload;

  if (!payload.id || !payload.action) {
    return NextResponse.json(
      { message: "도메인 정보를 확인해주세요." },
      { status: 400 },
    );
  }

  try {
    if (payload.action === "delete") {
      await deleteDomainEntry(payload.id, user);
    } else if (payload.action === "adjust-balance") {
      await adjustDomainBalance({
        id: payload.id,
        amount: Number(payload.amount),
        direction: payload.balanceDirection === "decrease" ? "decrease" : "increase",
        processedBy: user.id,
        user,
      });
    } else if (payload.action === "link-account") {
      await linkDomainEntryAccount({
        id: payload.id,
        accountId: payload.accountId?.trim() ?? "",
        user,
      });
    } else if (payload.action === "update-account") {
      await updateDomainEntryAccount({
        id: payload.id,
        bankName: payload.bankName?.trim() ?? "",
        accountHolder: payload.accountHolder?.trim() ?? "",
        accountNumber: payload.accountNumber?.trim() ?? "",
        user,
      });
    } else if (payload.action === "update-withdraw-account") {
      await updateDomainWithdrawAccount({
        id: payload.id,
        bankName: payload.bankName?.trim() ?? "",
        accountHolder: payload.accountHolder?.trim() ?? "",
        accountNumber: payload.accountNumber?.trim() ?? "",
        user,
      });
    } else {
      await updateDomainEntryStatus({
        id: payload.id,
        depositEnabled: Boolean(payload.depositEnabled),
        user,
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "도메인 수정 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ...(await getDomainListBoardData(user)),
      message:
        payload.action === "delete"
          ? "도메인이 삭제되었습니다."
          : payload.action === "adjust-balance"
            ? "보유금이 조정되었습니다."
          : payload.action === "link-account"
            ? "계좌가 연동되었습니다."
          : payload.action === "update-account"
            ? "계좌 정보가 수정되었습니다."
          : payload.action === "update-withdraw-account"
            ? "업체 출금 계좌가 수정되었습니다."
            : "도메인 상태가 변경되었습니다.",
  });
}

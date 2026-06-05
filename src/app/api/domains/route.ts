import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { hasDatabaseUrl } from "@/lib/db";
import {
  adjustDomainBalance,
  createDomain,
  deleteDomain,
  getDomainBoardData,
  updateDomain,
} from "@/lib/domain-management-repository";

export const runtime = "nodejs";

type CreateDomainPayload = {
  domainName?: string;
  distributorId?: string;
  distributorName?: string;
};

type PatchDomainPayload = {
  id?: string;
  action?: "update" | "toggle-status" | "delete" | "adjust-balance";
  domainName?: string;
  distributorId?: string;
  depositEnabled?: boolean;
  balanceDirection?: "increase" | "decrease";
  amount?: number;
};

function isWritableRole(role: string | undefined) {
  return role === "MASTER";
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

  return NextResponse.json(await getDomainBoardData([], user));
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user || !isWritableRole(user.role)) {
    return NextResponse.json(
      { message: "도메인을 생성할 권한이 없습니다." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as CreateDomainPayload;
  const domainName = payload.domainName?.trim() ?? "";
  const distributorId = payload.distributorId?.trim();

  if (!domainName) {
    return NextResponse.json(
      { message: "도메인명을 입력해주세요." },
      { status: 400 },
    );
  }

  if (hasDatabaseUrl()) {
    if (!isUuid(distributorId)) {
      return NextResponse.json(
        { message: "하부계정을 선택해주세요." },
        { status: 400 },
      );
    }

    try {
      await createDomain({ domainName, distributorId: distributorId! });
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "도메인 생성 중 오류가 발생했습니다.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ...(await getDomainBoardData([], user)),
      message: "도메인이 생성되었습니다.",
    });
  }

  return NextResponse.json({
    row: {
      id: `DOM-${Date.now().toString().slice(-6)}`,
      headquarters: payload.distributorName ?? "하부계정",
      topDistributor: user.nickname,
      distributor: payload.distributorName ?? "하부계정",
      loginId: "-",
      companyName: domainName,
      url: domainName,
      balance: 0,
      bankName: "-",
      accountNumber: "-",
      accountHolder: "-",
      accountLinked: false,
      depositEnabled: true,
      createdAt: "-",
      users: [],
    },
    message: "도메인이 생성되었습니다.",
  });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();

  if (!user || !isWritableRole(user.role)) {
    return NextResponse.json(
      { message: "도메인을 수정할 권한이 없습니다." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as PatchDomainPayload;

  if (!payload.id || !payload.action) {
    return NextResponse.json(
      { message: "수정할 도메인 정보가 없습니다." },
      { status: 400 },
    );
  }

  if (hasDatabaseUrl()) {
    if (!isUuid(payload.id)) {
      return NextResponse.json(
        { message: "도메인 정보를 확인해주세요." },
        { status: 400 },
      );
    }

    try {
      if (payload.action === "delete") {
        await deleteDomain(payload.id);
      } else if (payload.action === "adjust-balance") {
        await adjustDomainBalance({
          id: payload.id,
          amount: Number(payload.amount),
          direction: payload.balanceDirection === "decrease" ? "decrease" : "increase",
          processedBy: user.id,
        });
      } else {
        await updateDomain({
          id: payload.id,
          domainName:
            payload.action === "update" ? payload.domainName?.trim() : undefined,
          distributorId:
            payload.action === "update" ? payload.distributorId?.trim() : undefined,
          depositEnabled:
            payload.action === "toggle-status"
              ? Boolean(payload.depositEnabled)
              : undefined,
        });
      }
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "도메인 수정 중 오류가 발생했습니다.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ...(await getDomainBoardData([], user)),
      message:
        payload.action === "delete"
          ? "도메인이 삭제되었습니다."
          : payload.action === "adjust-balance"
            ? "보유금이 조정되었습니다."
          : "도메인이 수정되었습니다.",
    });
  }

  return NextResponse.json({
    message:
      payload.action === "delete"
        ? "도메인이 삭제되었습니다."
        : payload.action === "adjust-balance"
          ? "보유금이 조정되었습니다."
        : "도메인이 수정되었습니다.",
  });
}

import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  createDbChargeRequest,
  getChargeRequestChangesForUser,
  getChargeRequestsForUser,
  processDbChargeRequest,
  processMockChargeRequest,
  resetChargeRequestsForUser,
} from "@/lib/charge-requests-repository";
import { hasDatabaseUrl } from "@/lib/db";
import { getChargeRequestsByCompany } from "@/lib/mock-api-store";
import {
  getMockChargeStateFromCookie,
  setMockChargeStateCookie,
} from "@/lib/mock-state-cookie";
import type { ProcessedRequest } from "@/lib/charge-utils";
import { canProcessRequests } from "@/lib/permissions";

const allowedStatuses: ProcessedRequest["status"][] = ["승인", "승인거절"];

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const since = new URL(request.url).searchParams.get("since");

  if (since && Number.isFinite(Date.parse(since))) {
    return NextResponse.json({
      changes: await getChargeRequestChangesForUser(user, since),
    });
  }

  return NextResponse.json(await getChargeRequestsForUser(user));
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json()) as {
    action?: string;
    id?: string;
    status?: ProcessedRequest["status"];
    externalId?: string;
    userId?: string;
    amount?: number;
    depositor?: string;
    bankName?: string;
    accountNumber?: string;
    domainId?: string;
    domainName?: string;
  };

  if (body.action === "reset") {
    const result = await resetChargeRequestsForUser(user);

    return result instanceof NextResponse ? result : NextResponse.json(result);
  }

  if (body.action === "create") {
    if (!canProcessRequests(user)) {
      return NextResponse.json(
        { message: "충전신청을 생성할 권한이 없습니다." },
        { status: 403 },
      );
    }

    if (!hasDatabaseUrl()) {
      return NextResponse.json(
        { message: "DB 연결 환경에서만 충전신청 생성 API를 사용할 수 있습니다." },
        { status: 400 },
      );
    }

    const userId = body.userId?.trim() ?? "";
    const domainId = body.domainId?.trim() ?? "";
    const amount = Number(body.amount);

    if (!userId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { message: "입금자명과 신청금액을 확인해주세요." },
        { status: 400 },
      );
    }

    try {
      await createDbChargeRequest({
        externalId: body.externalId,
        userId,
        amount,
        depositor: body.depositor,
        bankName: body.bankName,
        accountNumber: body.accountNumber,
        domainId,
        domainName: body.domainName,
        rawPayload: body,
        user,
      });
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "충전신청 생성 중 오류가 발생했습니다.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(await getChargeRequestsForUser(user), { status: 201 });
  }

  if (!body.id || !body.status || !allowedStatuses.includes(body.status)) {
    return NextResponse.json(
      { message: "요청 ID와 처리 상태를 확인해주세요." },
      { status: 400 },
    );
  }

  if (!canProcessRequests(user)) {
    return NextResponse.json(
      { message: "충전신청을 처리할 권한이 없습니다." },
      { status: 403 },
    );
  }

  if (hasDatabaseUrl()) {
    let processedRequest: ProcessedRequest | null;

    try {
      processedRequest = await processDbChargeRequest({
        id: body.id,
        status: body.status,
        processedBy: user.id,
        user,
      });
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "충전신청 처리 중 오류가 발생했습니다.",
        },
        { status: 400 },
      );
    }

    if (!processedRequest) {
      return NextResponse.json(
        { message: "처리할 충전신청을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      processedRequest,
    });
  }

  const state = await getMockChargeStateFromCookie();
  const processedRequest = processMockChargeRequest({
    user,
    id: body.id,
    status: body.status,
    state,
  });

  if (!processedRequest) {
    return NextResponse.json(
      { message: "처리할 충전신청을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const response = NextResponse.json({
    processedRequest,
    ...getChargeRequestsByCompany(user.companyName, state),
  });
  setMockChargeStateCookie(response, state);

  return response;
}

import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  createDbChargeRequest,
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

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
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
    const amount = Number(body.amount);

    if (!userId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { message: "유저ID와 신청금액을 확인해주세요." },
        { status: 400 },
      );
    }

    await createDbChargeRequest({
      externalId: body.externalId,
      userId,
      amount,
      depositor: body.depositor,
      bankName: body.bankName,
      accountNumber: body.accountNumber,
      domainName: body.domainName,
      rawPayload: body,
      user,
    });

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
    const processedRequest = await processDbChargeRequest({
      id: body.id,
      status: body.status,
      processedBy: user.id,
    });

    if (!processedRequest) {
      return NextResponse.json(
        { message: "처리할 대기 충전신청을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      processedRequest,
      ...(await getChargeRequestsForUser(user)),
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

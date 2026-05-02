import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  getChargeRequestsByCompany,
  processChargeRequest,
  resetMockChargeRequests,
} from "@/lib/mock-api-store";
import type { ProcessedRequest } from "@/lib/mock-charge-data";

const allowedStatuses: ProcessedRequest["status"][] = ["승인", "승인거절"];

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json(getChargeRequestsByCompany(user.companyName));
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
  };

  if (body.action === "reset") {
    resetMockChargeRequests();

    return NextResponse.json(getChargeRequestsByCompany(user.companyName));
  }

  if (!body.id || !body.status || !allowedStatuses.includes(body.status)) {
    return NextResponse.json(
      { message: "요청 ID와 처리 상태를 확인해주세요." },
      { status: 400 },
    );
  }

  const processedRequest = processChargeRequest(
    user.companyName,
    body.id,
    body.status,
  );

  if (!processedRequest) {
    return NextResponse.json(
      { message: "처리할 충전신청을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    processedRequest,
    ...getChargeRequestsByCompany(user.companyName),
  });
}

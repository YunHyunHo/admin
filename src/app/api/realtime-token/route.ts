import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  createMapleRealtimeToken,
  isMapleRealtimeStagingUser,
} from "@/lib/realtime-staging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!isMapleRealtimeStagingUser(user)) {
    return NextResponse.json(
      { message: "Maple Preview 실시간 테스트 대상이 아닙니다." },
      { status: 403 },
    );
  }

  const clientInstanceId = new URL(request.url).searchParams
    .get("clientInstanceId")
    ?.trim();

  if (!clientInstanceId || !/^[a-zA-Z0-9-]{8,80}$/.test(clientInstanceId)) {
    return NextResponse.json(
      { message: "올바른 클라이언트 식별자가 필요합니다." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    createMapleRealtimeToken({ user, clientInstanceId }),
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  getRealtimeServerPublicWebSocketUrl,
  isMapleRealtimeGatewayConfigured,
} from "@/lib/realtime-server-config";
import { createRealtimeTicket } from "@/lib/realtime-ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!isMapleRealtimeGatewayConfigured(user.loginId)) {
    return NextResponse.json(
      { message: "Realtime Server 테스트 대상이 아닙니다." },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      url: getRealtimeServerPublicWebSocketUrl(),
      ticket: createRealtimeTicket(user),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

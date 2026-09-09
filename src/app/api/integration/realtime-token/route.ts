import { NextResponse } from "next/server";

import { getPartnerAccess } from "@/lib/partner-auth";
import {
  createRealtimeToken,
  getPartnerRealtimePrincipal,
  getRealtimeGroupMode,
} from "@/lib/realtime-staging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const partnerAccess = getPartnerAccess(request);
  if (!partnerAccess.access) {
    return NextResponse.json(
      { mode: "legacy", message: "유효한 업체 로그인 토큰이 필요합니다." },
      { status: 401 },
    );
  }

  const clientInstanceId = new URL(request.url).searchParams.get("clientInstanceId")?.trim();
  if (!clientInstanceId || !/^[a-zA-Z0-9-]{8,80}$/.test(clientInstanceId)) {
    return NextResponse.json({ message: "올바른 클라이언트 식별자가 필요합니다." }, { status: 400 });
  }

  const principal = await getPartnerRealtimePrincipal({
    loginId: partnerAccess.access.loginId,
    domainId: partnerAccess.access.domainId,
  });
  if (!principal || await getRealtimeGroupMode(principal.ownerLoginId) !== "websocket") {
    return NextResponse.json(
      { mode: "legacy" },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  }

  return NextResponse.json(
    { mode: "websocket", ...createRealtimeToken({ principal, clientInstanceId }) },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}

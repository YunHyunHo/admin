import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  createRealtimeToken,
  getAdminRealtimePrincipal,
  getRealtimeGroupMode,
} from "@/lib/realtime-staging";
import {
  getRealtimeBuildVersion,
  logAdminRealtimeDiagnostic,
} from "@/lib/realtime-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const principal = await getAdminRealtimePrincipal(user);
  const mode = principal
    ? await getRealtimeGroupMode(principal.ownerLoginId)
    : "legacy";
  if (!principal || mode !== "websocket") {
    await logAdminRealtimeDiagnostic({
      request,
      user,
      event: "token-rejected",
      client: {
        mode,
        modeReason: principal ? "flag-legacy" : "not-eligible",
        tokenStatus: "rejected",
        wsStatus: "not-attempted",
        buildVersion: getRealtimeBuildVersion(),
      },
    });
    return NextResponse.json(
      { message: "Realtime V2 사용 대상이 아닙니다." },
      { status: 403 },
    );
  }

  const clientInstanceId = new URL(request.url).searchParams
    .get("clientInstanceId")
    ?.trim();

  if (!clientInstanceId || !/^[a-zA-Z0-9-]{8,80}$/.test(clientInstanceId)) {
    await logAdminRealtimeDiagnostic({
      request,
      user,
      event: "token-invalid-client",
      client: {
        mode,
        tokenStatus: "invalid-client-instance",
        wsStatus: "not-attempted",
        buildVersion: getRealtimeBuildVersion(),
        clientInstanceId,
      },
    });
    return NextResponse.json(
      { message: "올바른 클라이언트 식별자가 필요합니다." },
      { status: 400 },
    );
  }

  await logAdminRealtimeDiagnostic({
    request,
    user,
    event: "token-issued",
    client: {
      mode,
      tokenStatus: "issued",
      wsStatus: "connecting",
      buildVersion: getRealtimeBuildVersion(),
      clientInstanceId,
    },
  });

  return NextResponse.json(
    createRealtimeToken({ principal, clientInstanceId }),
    { headers: { "Cache-Control": "no-store" } },
  );
}

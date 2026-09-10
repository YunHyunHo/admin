import { getSessionUser } from "@/lib/auth";
import {
  logAdminRealtimeDiagnostic,
  parseRealtimeClientDiagnostic,
} from "@/lib/realtime-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  await logAdminRealtimeDiagnostic({
    request,
    user,
    event: typeof body?.event === "string" ? body.event : "client-state",
    client: parseRealtimeClientDiagnostic(body),
  });

  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

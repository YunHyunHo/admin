import { getSessionUser } from "@/lib/auth";
import { getRealtimeAccountControl } from "@/lib/realtime-account-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  return Response.json(await getRealtimeAccountControl(user), {
    headers: { "Cache-Control": "no-store, private" },
  });
}

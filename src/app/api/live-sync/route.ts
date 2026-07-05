import { GET as handleRequestEvents } from "@/app/api/request-events/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleRequestEvents(request);
}

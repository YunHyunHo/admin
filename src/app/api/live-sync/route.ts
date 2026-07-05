import { GET as handleRequestEvents } from "@/app/api/request-events/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const response = await handleRequestEvents(request);
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.startsWith("text/event-stream")) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/x-ndjson; charset=utf-8");

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

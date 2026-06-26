import { NextResponse } from "next/server";

import { revokePartnerRefreshToken } from "@/lib/partner-auth";

export const runtime = "nodejs";

const allowedOrigins = new Set(["https://laylow.org", "https://www.laylow.org"]);

type LogoutPayload = {
  refreshToken?: string;
};

function withCors(response: NextResponse, origin: string | null) {
  if (origin && allowedOrigins.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }

  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return response;
}

export async function OPTIONS(request: Request) {
  return withCors(new NextResponse(null, { status: 204 }), request.headers.get("origin"));
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let payload: LogoutPayload;

  try {
    payload = (await request.json()) as LogoutPayload;
  } catch {
    payload = {};
  }

  const refreshToken = payload.refreshToken?.trim() ?? "";

  if (refreshToken) {
    await revokePartnerRefreshToken(refreshToken);
  }

  return withCors(NextResponse.json({ ok: true }), origin);
}

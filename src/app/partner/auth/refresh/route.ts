import { NextResponse } from "next/server";

import { refreshPartnerAccessToken } from "@/lib/partner-auth";

export const runtime = "nodejs";

const allowedOrigins = new Set(["https://laylow.org", "https://www.laylow.org"]);

type RefreshPayload = {
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
  let payload: RefreshPayload;

  try {
    payload = (await request.json()) as RefreshPayload;
  } catch {
    return withCors(
      NextResponse.json(
        { ok: false, message: "요청 형식을 확인해주세요." },
        { status: 400 },
      ),
      origin,
    );
  }

  const refreshToken = payload.refreshToken?.trim() ?? "";

  if (!refreshToken) {
    return withCors(
      NextResponse.json(
        { ok: false, message: "refreshToken이 필요합니다." },
        { status: 400 },
      ),
      origin,
    );
  }

  const result = await refreshPartnerAccessToken(refreshToken);

  if (!result) {
    return withCors(
      NextResponse.json(
        { ok: false, message: "유효하지 않거나 만료된 갱신 토큰입니다." },
        { status: 401 },
      ),
      origin,
    );
  }

  return withCors(
    NextResponse.json({
      ok: true,
      token: result.token,
    }),
    origin,
  );
}

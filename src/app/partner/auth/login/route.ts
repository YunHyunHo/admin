import { NextResponse } from "next/server";

import { loginPartnerAccount } from "@/lib/partner-auth";

export const runtime = "nodejs";

const allowedOrigins = new Set(["https://laylow.org", "https://www.laylow.org"]);

type LoginPayload = {
  loginId?: string;
  password?: string;
  domain?: string;
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

  let payload: LoginPayload;

  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return withCors(
      NextResponse.json(
        { ok: false, message: "요청 형식을 확인해주세요." },
        { status: 400 },
      ),
      origin,
    );
  }

  const loginId = payload.loginId?.trim() ?? "";
  const password = payload.password ?? "";
  const domain = payload.domain?.trim() ?? "";

  if (!loginId || !password || !domain) {
    return withCors(
      NextResponse.json(
        { ok: false, message: "loginId, password, domain은 모두 필수입니다." },
        { status: 400 },
      ),
      origin,
    );
  }

  const result = await loginPartnerAccount({ loginId, password, domain });

  if (!result) {
    return withCors(
      NextResponse.json(
        { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      ),
      origin,
    );
  }

  return withCors(
    NextResponse.json({
      ok: true,
      token: result.token,
      user: result.user,
      partner: result.partner,
    }),
    origin,
  );
}

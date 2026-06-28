import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { hasDatabaseUrl } from "@/lib/db";
import {
  connectTelegramChat,
  getTelegramSettings,
  saveTelegramBot,
  sendTelegramTest,
} from "@/lib/telegram-notifications";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json({ settings: await getTelegramSettings(user) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (user.role !== "DOMAIN_ADMIN") return NextResponse.json({ message: "업체 어드민만 설정할 수 있습니다." }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ message: "DB 연결 환경에서만 사용할 수 있습니다." }, { status: 400 });
  const body = (await request.json()) as { action?: string; companyId?: string; token?: string };
  if (!body.companyId) return NextResponse.json({ message: "업체 정보가 필요합니다." }, { status: 400 });
  try {
    let message = "";
    if (body.action === "save-token") {
      if (!body.token?.trim()) throw new Error("봇 토큰을 입력해주세요.");
      const username = await saveTelegramBot(user, body.companyId, body.token);
      message = `@${username} 봇이 확인되었습니다. 텔레그램에서 /start를 보내주세요.`;
    } else if (body.action === "connect-chat") {
      const title = await connectTelegramChat(user, body.companyId);
      message = `${title} 채팅방이 연결되었습니다.`;
    } else if (body.action === "test") {
      await sendTelegramTest(user, body.companyId);
      message = "테스트 알림을 보냈습니다.";
    } else {
      return NextResponse.json({ message: "지원하지 않는 작업입니다." }, { status: 400 });
    }
    return NextResponse.json({ message, settings: await getTelegramSettings(user) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "텔레그램 설정에 실패했습니다." }, { status: 400 });
  }
}

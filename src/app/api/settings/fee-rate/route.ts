import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  getAdminSettingsFromCookie,
  setAdminSettingsCookie,
} from "@/lib/settings-cookie";
import { getFeeRateByCompanyFromSettings } from "@/lib/charge-utils";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const settings = await getAdminSettingsFromCookie();

  return NextResponse.json({
    companyName: user.companyName,
    feeRate: getFeeRateByCompanyFromSettings(user.companyName, settings),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json()) as { feeRate?: number | string };
  const feeRate = Number(body.feeRate);

  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate > 100) {
    return NextResponse.json(
      { message: "수수료 요율은 0부터 100 사이 숫자로 입력해주세요." },
      { status: 400 },
    );
  }

  const settings = await getAdminSettingsFromCookie();
  const nextSettings = {
    ...settings,
    feeRates: {
      ...settings.feeRates,
      [user.companyName]: feeRate,
    },
  };
  const response = NextResponse.json({
    companyName: user.companyName,
    feeRate,
    message: "수수료 요율이 저장되었습니다.",
  });

  setAdminSettingsCookie(response, nextSettings);

  return response;
}

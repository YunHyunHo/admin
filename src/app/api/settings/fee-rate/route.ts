import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  getFeeRateSettingsForUser,
  saveFeeRateSettings,
} from "@/lib/fee-rates-repository";
import { hasDatabaseUrl } from "@/lib/db";
import {
  getAdminSettingsFromCookie,
  setAdminSettingsCookie,
} from "@/lib/settings-cookie";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json(await getFeeRateSettingsForUser(user));
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (user.role !== "MASTER") {
    return NextResponse.json(
      { message: "수수료 수정은 마스터 계정만 가능합니다." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    id?: string;
    distributorId?: string;
    feeRate?: number | string;
    totalRate?: number | string;
    topDistributorRate?: number | string;
    distributorRate?: number | string;
  };
  const totalRate = Number(body.totalRate ?? body.feeRate);
  const topDistributorRate = Number(body.topDistributorRate ?? body.totalRate ?? body.feeRate);
  const distributorRate = Number(body.distributorRate ?? 0);

  if (
    !Number.isFinite(totalRate) ||
    !Number.isFinite(topDistributorRate) ||
    !Number.isFinite(distributorRate) ||
    totalRate < 0 ||
    topDistributorRate < 0 ||
    distributorRate < 0 ||
    totalRate > 100 ||
    topDistributorRate > 100 ||
    distributorRate > 100 ||
    Number((topDistributorRate + distributorRate).toFixed(2)) !== Number(totalRate.toFixed(2))
  ) {
    return NextResponse.json(
      { message: "수수료 요율과 배분 합계를 확인해주세요." },
      { status: 400 },
    );
  }

  if (hasDatabaseUrl()) {
    await saveFeeRateSettings({
      user,
      targetId: body.id,
      distributorId: body.distributorId,
      totalRate,
      topDistributorRate,
      distributorRate,
    });

    return NextResponse.json({
      ...(await getFeeRateSettingsForUser(user)),
      message: "수수료 요율이 저장되었습니다.",
    });
  }

  const settings = await getAdminSettingsFromCookie();
  const response = NextResponse.json({
    ...(await getFeeRateSettingsForUser(user)),
    message: "수수료 요율이 저장되었습니다.",
  });
  const nextSettings = {
    ...settings,
    feeRates: {
      ...settings.feeRates,
      [user.companyName]: totalRate,
    },
  };

  setAdminSettingsCookie(response, nextSettings);

  return response;
}

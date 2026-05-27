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
    domainId?: string;
    distributorId?: string;
    companyId?: string;
    companyRate?: number | string;
    topDistributorRate?: number | string;
    distributorRate?: number | string;
  };
  const companyRate = Number(body.companyRate);
  const topDistributorRate = Number(body.topDistributorRate);
  const distributorRate = Number(body.distributorRate);
  const totalRate = companyRate + topDistributorRate + distributorRate;

  if (
    !Number.isFinite(companyRate) ||
    !Number.isFinite(topDistributorRate) ||
    !Number.isFinite(distributorRate) ||
    companyRate < 0 ||
    topDistributorRate < 0 ||
    distributorRate < 0 ||
    companyRate > 100 ||
    topDistributorRate > 100 ||
    distributorRate > 100
  ) {
    return NextResponse.json(
      { message: "수수료 요율 값을 확인해주세요." },
      { status: 400 },
    );
  }

  if (hasDatabaseUrl()) {
    await saveFeeRateSettings({
      user,
      domainId: body.domainId,
      distributorId: body.distributorId,
      companyId: body.companyId,
      companyRate,
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

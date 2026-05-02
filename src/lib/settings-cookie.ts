import { cookies } from "next/headers";

import { companyFeeRates } from "@/lib/charge-utils";

export type AdminSettings = {
  feeRates: Record<string, number>;
};

const SETTINGS_COOKIE = "vendor_admin_settings";

function getDefaultSettings(): AdminSettings {
  return {
    feeRates: { ...companyFeeRates },
  };
}

function encodeSettings(settings: AdminSettings) {
  return Buffer.from(JSON.stringify(settings)).toString("base64url");
}

function decodeSettings(value: string | undefined): AdminSettings {
  if (!value) {
    return getDefaultSettings();
  }

  try {
    return {
      ...getDefaultSettings(),
      ...JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    };
  } catch {
    return getDefaultSettings();
  }
}

export async function getAdminSettingsFromCookie() {
  const cookieStore = await cookies();

  return decodeSettings(cookieStore.get(SETTINGS_COOKIE)?.value);
}

export function setAdminSettingsCookie(
  response: Response & {
    cookies: {
      set: (
        name: string,
        value: string,
        options: {
          httpOnly: boolean;
          sameSite: "lax";
          secure: boolean;
          path: string;
        },
      ) => void;
    };
  },
  settings: AdminSettings,
) {
  response.cookies.set(SETTINGS_COOKIE, encodeSettings(settings), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

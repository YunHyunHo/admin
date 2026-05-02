import { cookies } from "next/headers";
import {
  getDefaultChargeRequestState,
  type ChargeRequestState,
} from "@/lib/mock-api-store";

const MOCK_STATE_COOKIE = "vendor_admin_mock_state";

function encodeState(state: ChargeRequestState) {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

function decodeState(value: string | undefined): ChargeRequestState {
  if (!value) {
    return getDefaultChargeRequestState();
  }

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return getDefaultChargeRequestState();
  }
}

export async function getMockChargeStateFromCookie() {
  const cookieStore = await cookies();

  return decodeState(cookieStore.get(MOCK_STATE_COOKIE)?.value);
}

export function setMockChargeStateCookie(
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
  state: ChargeRequestState,
) {
  response.cookies.set(MOCK_STATE_COOKIE, encodeState(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

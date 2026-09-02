const mapleRealtimePilotLoginId = "maple";

function getEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function isMapleRealtimeGatewayConfigured(loginId: string) {
  return (
    loginId.trim().toLowerCase() === mapleRealtimePilotLoginId &&
    getEnv("REALTIME_SERVER_PUBLIC_WS_URL").length > 0 &&
    getEnv("REALTIME_SERVER_SHARED_SECRET").length >= 32
  );
}

export function getRealtimeServerPublicWebSocketUrl() {
  return getEnv("REALTIME_SERVER_PUBLIC_WS_URL");
}

export function getRealtimeServerSharedSecret() {
  const secret = getEnv("REALTIME_SERVER_SHARED_SECRET");

  if (secret.length < 32) {
    throw new Error("REALTIME_SERVER_SHARED_SECRET은 32자 이상이어야 합니다.");
  }

  return secret;
}

export function getRealtimeServerInternalConfig() {
  const url = getEnv("REALTIME_SERVER_INTERNAL_URL");
  const secret = getEnv("REALTIME_SERVER_PUSH_SECRET");

  return url && secret.length >= 32 ? { url, secret } : null;
}

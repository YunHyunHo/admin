import Redis from "ioredis";

import type { StoredAdminRequestEvent } from "@/lib/admin-request-events";

export const adminRequestEventsRedisStream = "admin:request-events:v1";

function getRedisUrl() {
  return process.env.REDIS_URL?.trim() ?? "";
}

export function hasAdminRequestEventsRedis() {
  return getRedisUrl().length > 0;
}

export function createAdminRequestEventsRedis(options?: { blocking?: boolean }) {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    throw new Error("REDIS_URL 환경변수가 필요합니다.");
  }

  return new Redis(redisUrl, {
    connectTimeout: 1000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: options?.blocking ? null : 1,
    retryStrategy: () => null,
  });
}

export async function appendAdminRequestEventToRedis(
  event: StoredAdminRequestEvent,
) {
  if (!hasAdminRequestEventsRedis()) {
    return;
  }

  const redis = createAdminRequestEventsRedis();

  try {
    await redis.connect();
    await redis.xadd(
      adminRequestEventsRedisStream,
      "MAXLEN",
      "~",
      10000,
      "event",
      JSON.stringify(event),
    );
  } finally {
    redis.disconnect();
  }
}

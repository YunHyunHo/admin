import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { SessionUser } from "@/lib/auth";
import { getRealtimeServerSharedSecret } from "@/lib/realtime-server-config";

const realtimeTicketLifetimeSeconds = 60;

export type RealtimeTicketPayload = {
  version: 1;
  connectionId: string;
  loginId: string;
  role: SessionUser["role"];
  issuedAt: number;
  expiresAt: number;
};

function sign(payload: string) {
  return createHmac("sha256", getRealtimeServerSharedSecret())
    .update(payload)
    .digest("base64url");
}

export function createRealtimeTicket(user: SessionUser) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const ticketPayload: RealtimeTicketPayload = {
    version: 1,
    connectionId: randomUUID(),
    loginId: user.loginId,
    role: user.role,
    issuedAt,
    expiresAt: issuedAt + realtimeTicketLifetimeSeconds,
  };
  const payload = Buffer.from(JSON.stringify(ticketPayload)).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifyRealtimeTicket(ticket: string) {
  const [payload, signature] = ticket.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(signature);

  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as RealtimeTicketPayload;
    const now = Math.floor(Date.now() / 1000);

    if (
      parsed.version !== 1 ||
      parsed.loginId.trim().toLowerCase() !== "maple" ||
      parsed.expiresAt < now ||
      parsed.issuedAt > now + 30 ||
      typeof parsed.connectionId !== "string"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

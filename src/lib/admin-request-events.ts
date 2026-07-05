import { hasDatabaseUrl, query } from "@/lib/db";

export const adminRequestEventsChannel = "admin_request_events";

export type AdminRequestEventKind =
  | "charge"
  | "domain_exchange"
  | "distributor_withdrawal";

export type AdminRequestEventStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED"
  | "CANCELED";

export type AdminRequestEvent = {
  kind: AdminRequestEventKind;
  requestId: string;
  companyId: string | null;
  domainId: string | null;
  distributorId: string | null;
  status: AdminRequestEventStatus;
  occurredAt: string;
};

type QueryExecutor = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

export async function publishAdminRequestEvent(
  executor: QueryExecutor,
  event: AdminRequestEvent,
) {
  if (!hasDatabaseUrl()) {
    return;
  }

  await executor.query("select pg_notify($1, $2)", [
    adminRequestEventsChannel,
    JSON.stringify(event),
  ]);
}

export async function publishAdminRequestEventWithQuery(event: AdminRequestEvent) {
  if (!hasDatabaseUrl()) {
    return;
  }

  await query("select pg_notify($1, $2)", [
    adminRequestEventsChannel,
    JSON.stringify(event),
  ]);
}

export function parseAdminRequestEvent(payload: string | undefined) {
  if (!payload) {
    return null;
  }

  try {
    const event = JSON.parse(payload) as Partial<AdminRequestEvent>;

    if (
      (event.kind === "charge" ||
        event.kind === "domain_exchange" ||
        event.kind === "distributor_withdrawal") &&
      typeof event.requestId === "string" &&
      (typeof event.companyId === "string" || event.companyId === null) &&
      (typeof event.domainId === "string" || event.domainId === null) &&
      (typeof event.distributorId === "string" || event.distributorId === null) &&
      (event.status === "PENDING" ||
        event.status === "APPROVED" ||
        event.status === "REJECTED" ||
        event.status === "COMPLETED" ||
        event.status === "CANCELED") &&
      typeof event.occurredAt === "string"
    ) {
      return event as AdminRequestEvent;
    }
  } catch {
    return null;
  }

  return null;
}

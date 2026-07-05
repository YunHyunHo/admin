import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";

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

export type StoredAdminRequestEvent = AdminRequestEvent & {
  eventId: string;
};

type QueryExecutor = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

let schemaPromise: Promise<void> | null = null;

export async function ensureAdminRequestEventsSchema() {
  if (!hasDatabaseUrl()) {
    return;
  }

  if (!schemaPromise) {
    schemaPromise = (async () => {
      await query(`
        create table if not exists admin_request_event_log (
          id bigint generated always as identity primary key,
          event jsonb not null,
          created_at timestamptz not null default now()
        )
      `);
      await query(`
        create index if not exists idx_admin_request_event_log_created_at
        on admin_request_event_log (created_at desc)
      `);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  await schemaPromise;
}

async function persistAndPublishAdminRequestEvent(
  executor: QueryExecutor,
  event: AdminRequestEvent,
) {
  const result = (await executor.query(
    `
      insert into admin_request_event_log (event)
      values ($1::jsonb)
      returning id::text
    `,
    [JSON.stringify(event)],
  )) as { rows?: Array<{ id?: string }> };
  const eventId = result.rows?.[0]?.id;

  if (!eventId) {
    throw new Error("실시간 이벤트 커서를 생성하지 못했습니다.");
  }

  const storedEvent: StoredAdminRequestEvent = { ...event, eventId };

  await executor.query("select pg_notify($1, $2)", [
    adminRequestEventsChannel,
    JSON.stringify(storedEvent),
  ]);
}

export async function publishAdminRequestEvent(
  executor: QueryExecutor,
  event: AdminRequestEvent,
) {
  if (!hasDatabaseUrl()) {
    return;
  }

  await ensureAdminRequestEventsSchema();
  await persistAndPublishAdminRequestEvent(executor, event);
}

export async function publishAdminRequestEventWithQuery(event: AdminRequestEvent) {
  if (!hasDatabaseUrl()) {
    return;
  }

  await ensureAdminRequestEventsSchema();
  await withTransaction(async (client) => {
    await persistAndPublishAdminRequestEvent(client, event);
  });
}

export async function getAdminRequestEventsAfter(
  eventId: string,
  limit = 500,
) {
  await ensureAdminRequestEventsSchema();

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const result = await query<{ id: string; event: AdminRequestEvent }>(
    `
      select id::text, event
      from admin_request_event_log
      where id > $1::bigint
      order by id asc
      limit $2
    `,
    [eventId, safeLimit],
  );

  return result.rows
    .map((row) => {
      const event = parseAdminRequestEvent(JSON.stringify(row.event));
      return event ? { ...event, eventId: row.id } : null;
    })
    .filter((event): event is StoredAdminRequestEvent => event !== null);
}

export async function getLatestAdminRequestEventId() {
  await ensureAdminRequestEventsSchema();

  const result = await query<{ id: string }>(
    `select coalesce(max(id), 0)::text as id from admin_request_event_log`,
  );

  return result.rows[0]?.id ?? "0";
}

export function parseAdminRequestEvent(payload: string | undefined) {
  if (!payload) {
    return null;
  }

  try {
    const event = JSON.parse(payload) as Partial<StoredAdminRequestEvent>;

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
      if (event.eventId !== undefined && !/^\d+$/.test(event.eventId)) {
        return null;
      }

      return event as AdminRequestEvent & { eventId?: string };
    }
  } catch {
    return null;
  }

  return null;
}

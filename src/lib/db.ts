import { Pool, type PoolClient, type QueryResultRow } from "pg";

type GlobalWithPgPool = typeof globalThis & {
  __vendorAdminPgPool?: Pool;
};

function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() ?? "";
}

export function hasDatabaseUrl() {
  return getDatabaseUrl().length > 0;
}

export function getPgPool() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL 환경변수를 설정해주세요.");
  }

  const globalStore = globalThis as GlobalWithPgPool;

  if (!globalStore.__vendorAdminPgPool) {
    globalStore.__vendorAdminPgPool = new Pool({
      connectionString: databaseUrl,
      ssl:
        process.env.DATABASE_SSL === "false"
          ? false
          : { rejectUnauthorized: false },
    });
  }

  return globalStore.__vendorAdminPgPool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return getPgPool().query<T>(text, values);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getPgPool().connect();

  try {
    await client.query("begin");
    const result = await callback(client);

    await client.query("commit");

    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

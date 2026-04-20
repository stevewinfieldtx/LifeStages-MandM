import { Pool, QueryResult, QueryResultRow } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is missing.");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("railway") ||
           process.env.DATABASE_URL.includes("rlwy.net")
        ? { rejectUnauthorized: false }
        : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    pool.on("error", (err) => {
      console.error("Unexpected Postgres pool error:", err);
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const res: QueryResult<T> = await getPool().query<T>(sql, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = any>(
  sql: string,
  params: any[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Database initialization script.
 * Runs db/schema.sql against the configured Postgres instance.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/init-db.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { getPool, closePool } from "../lib/db";

async function main(): Promise<void> {
  const schemaPath = join(__dirname, "..", "db", "schema.sql");
  const sql = readFileSync(schemaPath, "utf8");

  console.log("Running schema.sql...");
  await getPool().query(sql);
  console.log("✓ Schema initialized.");
}

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("init-db failed:", err);
    await closePool();
    process.exit(1);
  });

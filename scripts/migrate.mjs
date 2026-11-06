#!/usr/bin/env node
/**
 * Production migration runner.
 *
 * Kept dependency-light so it works in the runtime image (no tsx/dev
 * dependencies). It applies the same SQL migrations as `npm run db:migrate`.
 */
import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, "..", "drizzle");
const driver =
  process.env.HANSAN_DB_DRIVER ?? (process.env.DATABASE_URL ? "postgres" : "pglite");

if (driver === "postgres") {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required when HANSAN_DB_DRIVER=postgres");
    process.exit(1);
  }
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log("PostgreSQL migrations applied.");
  } finally {
    await pool.end();
  }
} else {
  const directory = process.env.HANSAN_PGLITE_DIR ?? ".data/pglite";
  if (!directory.includes("://")) {
    try {
      mkdirSync(path.dirname(path.resolve(directory)), { recursive: true });
      // Windows can mark synced folders ReadOnly; PGlite's WASM filesystem
      // treats that as a read-only mount. Clear it on the dedicated DB folder.
      const absoluteDir = path.resolve(directory);
      if (
        process.platform === "win32" &&
        existsSync(absoluteDir) &&
        (statSync(absoluteDir).mode & 0o200) === 0
      ) {
        chmodSync(absoluteDir, 0o755);
      }
    } catch (error) {
      console.error(
        `Unable to prepare the PGlite data directory "${path.resolve(directory)}": ${error.message}`,
      );
      process.exit(1);
    }
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(directory);
  try {
    await client.waitReady;
    await migrate(drizzle(client), { migrationsFolder });
    console.log(`PGlite migrations applied to ${directory}.`);
  } finally {
    await client.close();
  }
}

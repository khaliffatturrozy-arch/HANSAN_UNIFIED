import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { preparePgliteDirectory } from "./pglite-directory";
import { acquirePgliteDirectoryLock } from "./pglite-lock";
import * as schema from "./schema";

export type AppDb = PgDatabase<any, typeof schema, any>;
export type DbMode = "pglite" | "postgres";

interface DbHandle {
  mode: DbMode;
  db: AppDb;
  pglite?: PGlite;
  pool?: Pool;
  releasePgliteLock?: () => void;
}

type GlobalWithDb = typeof globalThis & {
  __hansanV4Database?: DbHandle;
  __hansanV4TestDb?: AppDb | null;
};

function readMode(): DbMode {
  const configured = process.env.HANSAN_DB_DRIVER;
  if (configured === "postgres") return "postgres";
  if (configured === "pglite") return "pglite";
  if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL) return "postgres";
  return "pglite";
}

export function getDbMode(): DbMode {
  return readMode();
}

function buildHandle(): DbHandle {
  const mode = readMode();

  if (mode === "postgres") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required when HANSAN_DB_DRIVER=postgres");
    }
    const pool = new Pool({ connectionString, max: 10 });
    return { mode, db: drizzlePg(pool, { schema }) as AppDb, pool };
  }

  if (process.env.NODE_ENV === "production" && !process.env.HANSAN_PGLITE_DIR) {
    // A production deployment must opt in explicitly before using the embedded
    // engine. This prevents an accidental non-durable or single-node database.
    throw new Error(
      "Production requires PostgreSQL. Set DATABASE_URL/HANSAN_DB_DRIVER=postgres, or explicitly set HANSAN_PGLITE_DIR for a single-node deployment.",
    );
  }

  const dir = preparePgliteDirectory(
    process.env.HANSAN_PGLITE_DIR ?? ".data/pglite",
  );
  const releasePgliteLock = acquirePgliteDirectoryLock(dir);
  try {
    const pglite = new PGlite(dir);
    return {
      mode,
      db: drizzlePglite(pglite, { schema }) as AppDb,
      pglite,
      releasePgliteLock,
    };
  } catch (error) {
    releasePgliteLock();
    throw error;
  }
}

function getHandle(): DbHandle {
  const globalStore = globalThis as GlobalWithDb;
  if (!globalStore.__hansanV4Database) {
    globalStore.__hansanV4Database = buildHandle();
  }
  return globalStore.__hansanV4Database;
}

export function getDb(): AppDb {
  const testDb = getTestDb();
  if (testDb) return testDb;
  return getHandle().db;
}

export function getDbHandle(): DbHandle {
  return getHandle();
}

/**
 * Test-only injection. Production code must never call this. The override is
 * process-global because route handlers and services share one composition
 * root, exactly as they do at runtime.
 */
export function setDatabaseForTests(db: AppDb | null): void {
  const globalStore = globalThis as GlobalWithDb;
  globalStore.__hansanV4TestDb = db;
}

function getTestDb(): AppDb | null {
  const globalStore = globalThis as GlobalWithDb;
  return globalStore.__hansanV4TestDb ?? null;
}

export async function closeDb(): Promise<void> {
  const globalStore = globalThis as GlobalWithDb;
  const handle = globalStore.__hansanV4Database;
  if (!handle) return;

  delete globalStore.__hansanV4Database;

  try {
    if (handle.pglite) await handle.pglite.close();
    if (handle.pool) await handle.pool.end();
  } catch (error) {
    // Keep the lock held when close fails: another process must not open a
    // database whose previous engine may still be active.
    throw new Error("Database close failed; the PGlite lock remains held.", {
      cause: error,
    });
  }

  handle.releasePgliteLock?.();
}

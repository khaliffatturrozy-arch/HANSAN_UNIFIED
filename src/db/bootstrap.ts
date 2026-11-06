import { isDemoMode } from "@/lib/env";
import { closeDb, getDb } from "./client";
import { migrateDatabase } from "./migrate";
import { seedDemo } from "./seed";

/**
 * Process-wide one-time database preparation.
 *
 * Development and single-node self-hosted installs migrate automatically.
 * Demo rows are only written outside production, and only when demo mode and a
 * local demo password are explicitly configured. Production deploys must run
 * `npm run db:migrate` before serving traffic; demo seeding is refused there.
 */

type ReadyGlobal = typeof globalThis & { __hansanV4Ready?: Promise<void> };

function autoMigrateEnabled(): boolean {
  if (process.env.HANSAN_AUTO_MIGRATE === "true") return true;
  if (process.env.HANSAN_AUTO_MIGRATE === "false") return false;
  return process.env.NODE_ENV !== "production";
}

async function prepare(): Promise<void> {
  if (autoMigrateEnabled()) {
    await migrateDatabase();
  }
  if (isDemoMode() && process.env.NODE_ENV !== "production") {
    await seedDemo(getDb());
  }
}

export function ensureDatabaseReady(): Promise<void> {
  const store = globalThis as ReadyGlobal;
  if (!store.__hansanV4Ready) {
    store.__hansanV4Ready = prepare().catch(async (error: unknown) => {
      try {
        await closeDb();
      } catch (cleanupError) {
        delete store.__hansanV4Ready;
        throw new AggregateError(
          [error, cleanupError],
          "Database initialization failed and the database handle could not be closed safely.",
        );
      }
      delete store.__hansanV4Ready;
      throw error;
    });
  }
  return store.__hansanV4Ready;
}

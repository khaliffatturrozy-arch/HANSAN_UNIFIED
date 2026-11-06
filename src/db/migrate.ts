import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDbHandle } from "./client";
import type * as schema from "./schema";

/**
 * Applies Drizzle's ordered SQL migrations. Safe to run repeatedly.
 */
export async function migrateDatabase(): Promise<void> {
  const handle = getDbHandle();
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");

  if (handle.mode === "pglite") {
    if (!handle.pglite) throw new Error("PGlite handle missing client");
    await handle.pglite.waitReady;
    // The shared AppDb type intentionally erases the concrete driver so domain
    // services can accept either engine; the migrator needs the concrete type.
    await migratePglite(handle.db as PgliteDatabase<typeof schema>, { migrationsFolder });
    return;
  }

  await migratePg(handle.db as NodePgDatabase<typeof schema>, { migrationsFolder });
}

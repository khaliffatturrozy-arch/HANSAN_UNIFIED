import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { AppDb } from "@/db/client";
import * as schema from "@/db/schema";

export interface TestDatabase {
  db: AppDb;
  close: () => Promise<void>;
}

/**
 * Isolated, in-memory PostgreSQL (PGlite) with the real Drizzle migration.
 * Tests exercise the same schema checks and transaction semantics as
 * production PostgreSQL where the feature set overlaps.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema }) as unknown as AppDb;
  await migrate(db as PgliteDatabase<typeof schema>, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
  return {
    db,
    close: async () => {
      await pglite.close();
    },
  };
}

import { ensureDatabaseReady } from "@/db/bootstrap";
import { getDb, type AppDb } from "@/db/client";

/**
 * Route/page composition root. Ensures migrations and the development seed
 * have completed before any query runs, then returns the shared DB handle.
 */
export async function readyDb(): Promise<AppDb> {
  await ensureDatabaseReady();
  return getDb();
}

import { sql } from "drizzle-orm";
import { jsonError, jsonOk } from "@/lib/api";
import { getDbMode } from "@/db/client";
import { readyDb } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await readyDb();
    await db.execute(sql`select 1`);
    return jsonOk({
      status: "ok",
      database: getDbMode(),
      databaseReachable: true,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(error);
  }
}

import { closeDb } from "../src/db/client";
import { migrateDatabase } from "../src/db/migrate";

async function main() {
  await migrateDatabase();
  console.log("[db] migrations applied");
  await closeDb();
}

main().catch(async (error) => {
  console.error("[db] migration failed", error);
  await closeDb().catch(() => undefined);
  process.exit(1);
});

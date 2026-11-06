import { closeDb, getDb } from "../src/db/client";
import { migrateDatabase } from "../src/db/migrate";
import { seedDemo } from "../src/db/seed";

async function main() {
  await migrateDatabase();
  const result = await seedDemo(getDb());
  console.log(
    result.created
      ? "[db] demo tenant created (slug: demo)"
      : "[db] demo tenant already exists; no changes made",
  );
  await closeDb();
}

main().catch(async (error) => {
  console.error("[db] seed failed", error);
  await closeDb().catch(() => undefined);
  process.exit(1);
});

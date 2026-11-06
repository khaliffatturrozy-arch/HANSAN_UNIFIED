import { randomBytes } from "node:crypto";
import path from "node:path";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { AppDb } from "@/db/client";
import * as schema from "@/db/schema";

/**
 * Real PostgreSQL validation helpers.
 *
 * HANSAN_TEST_POSTGRES_URL must point at a disposable PostgreSQL server. Every
 * suite run creates uniquely named databases on that server and drops them
 * afterwards, so it never touches an application database.
 */
export const POSTGRES_URL_ENV = "HANSAN_TEST_POSTGRES_URL";

export function getPostgresAdminUrl(): string {
  const value = process.env[POSTGRES_URL_ENV];
  if (!value) {
    throw new Error(
      `${POSTGRES_URL_ENV} is required for PostgreSQL validation. Point it at a ` +
        "disposable PostgreSQL server; the suite creates and drops its own databases.",
    );
  }
  return value;
}

export interface OpenPostgresDatabase {
  db: AppDb;
  pool: Pool;
  url: string;
  databaseName: string;
}

export interface PostgresTestDatabase extends OpenPostgresDatabase {
  adminUrl: string;
  closePool: () => Promise<void>;
  drop: () => Promise<void>;
  close: () => Promise<void>;
}

function databaseUrlFor(adminUrl: string, databaseName: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export async function openPostgresDatabase(
  adminUrl: string,
  databaseName: string,
): Promise<OpenPostgresDatabase> {
  const url = databaseUrlFor(adminUrl, databaseName);
  const pool = new Pool({ connectionString: url, max: 6 });
  // The recovery test terminates server-side connections. Idle clients then
  // emit an error event that must be observed; the pool replaces them.
  pool.on("error", () => {});
  const db = drizzle(pool, { schema }) as unknown as AppDb;
  return { db, pool, url, databaseName };
}

export async function migratePostgresDatabase(
  database: OpenPostgresDatabase,
): Promise<void> {
  await migrate(database.db as unknown as NodePgDatabase<typeof schema>, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
}

async function dropPostgresDatabase(
  adminUrl: string,
  databaseName: string,
): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

export async function createPostgresTestDatabase(): Promise<PostgresTestDatabase> {
  const adminUrl = getPostgresAdminUrl();
  const databaseName = `hansan_test_${Date.now()}_${randomBytes(6).toString("hex")}`;

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }

  const opened = await openPostgresDatabase(adminUrl, databaseName);
  await migratePostgresDatabase(opened);

  let poolClosed = false;
  const closePool = async () => {
    if (poolClosed) return;
    poolClosed = true;
    await opened.pool.end();
  };

  return {
    ...opened,
    adminUrl,
    closePool,
    drop: () => dropPostgresDatabase(adminUrl, databaseName),
    async close() {
      await closePool();
      await dropPostgresDatabase(adminUrl, databaseName);
    },
  };
}

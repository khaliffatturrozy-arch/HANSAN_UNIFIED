#!/usr/bin/env node
/**
 * PostgreSQL server-process restart probe for CI.
 *
 * prepare: creates a disposable database, applies the real Drizzle migrations,
 *          inserts one synthetic tenant, and writes probe metadata.
 * verify:  reconnects after the server container was restarted, verifies the
 *          committed row survived, then drops the probe database.
 *
 * Requires HANSAN_TEST_POSTGRES_URL and HANSAN_RESTART_STATE_FILE. The state
 * file belongs in the CI runner's temporary directory and is never committed.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const mode = process.argv[2];
const adminUrl = process.env.HANSAN_TEST_POSTGRES_URL;
const stateFile = process.env.HANSAN_RESTART_STATE_FILE;
const PROBE_NAME = "PostgreSQL restart probe";

function fail(message) {
  console.error(`[postgres-restart] ${message}`);
  process.exit(1);
}

if (!adminUrl) fail("HANSAN_TEST_POSTGRES_URL is required");
if (!stateFile) fail("HANSAN_RESTART_STATE_FILE is required");
if (mode !== "prepare" && mode !== "verify") {
  fail("usage: node scripts/postgres-restart-check.mjs <prepare|verify>");
}

function databaseUrl(databaseName) {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function connect(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function prepare() {
  const databaseName = `hansan_restart_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const slug = `pg-restart-${randomBytes(6).toString("hex")}`;

  const admin = await connect(adminUrl);
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }

  const client = await connect(databaseUrl(databaseName));
  try {
    await migrate(drizzle(client), {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    const result = await client.query(
      "insert into tenants (slug, name) values ($1, $2) returning id",
      [slug, PROBE_NAME],
    );
    const tenantId = result.rows[0]?.id;
    if (!tenantId) throw new Error("probe insert returned no id");

    writeFileSync(
      stateFile,
      JSON.stringify({ databaseName, tenantId, slug }),
      "utf8",
    );
    console.log(`[postgres-restart] prepared disposable database ${databaseName}`);
  } finally {
    await client.end();
  }
}

async function verify() {
  let state;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8"));
  } catch {
    fail("probe state file is missing or unreadable");
  }

  const client = await connect(databaseUrl(state.databaseName));
  try {
    const result = await client.query("select name from tenants where id = $1", [
      state.tenantId,
    ]);
    if (result.rows[0]?.name !== PROBE_NAME) {
      throw new Error("committed probe row did not survive the server restart");
    }
    console.log("[postgres-restart] committed row survived the server restart");
  } finally {
    await client.end();
  }

  const admin = await connect(adminUrl);
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${state.databaseName}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
  rmSync(stateFile, { force: true });
}

try {
  if (mode === "prepare") await prepare();
  else await verify();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

interface MockState {
  constructorError: Error | null;
  readyError: Error | null;
  migrationError: Error | null;
  closeError: Error | null;
  constructorCalls: number;
  closeCalls: number;
  resolveReady?: () => void;
}

const originalEnv = {
  dir: process.env.HANSAN_PGLITE_DIR,
  driver: process.env.HANSAN_DB_DRIVER,
  autoMigrate: process.env.HANSAN_AUTO_MIGRATE,
  demoMode: process.env.HANSAN_DEMO_MODE,
  nodeEnv: process.env.NODE_ENV,
};
const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "hansan-db-lifecycle-"));
  roots.push(root);
  return root;
}

function setOrDeleteEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function loadDatabaseMocks(state: MockState, dataDir: string) {
  vi.resetModules();
  vi.doMock("@electric-sql/pglite", () => ({
    PGlite: class {
      waitReady: Promise<void>;

      constructor() {
        state.constructorCalls += 1;
        if (state.constructorError) throw state.constructorError;
        this.waitReady = state.resolveReady
          ? new Promise<void>((resolveReady) => {
              state.resolveReady = resolveReady;
            })
          : state.readyError
            ? Promise.reject(state.readyError)
            : Promise.resolve();
      }

      async close(): Promise<void> {
        state.closeCalls += 1;
        if (state.closeError) throw state.closeError;
      }
    },
  }));
  vi.doMock("drizzle-orm/pglite", () => ({
    drizzle: () => ({}),
  }));
  vi.doMock("drizzle-orm/pglite/migrator", () => ({
    migrate: async () => {
      if (state.migrationError) throw state.migrationError;
    },
  }));

  process.env.HANSAN_PGLITE_DIR = dataDir;
  process.env.HANSAN_DB_DRIVER = "pglite";
  process.env.HANSAN_AUTO_MIGRATE = "true";
  process.env.HANSAN_DEMO_MODE = "false";
  setOrDeleteEnv("NODE_ENV", "test");

  const client = await import("@/db/client");
  const bootstrap = await import("@/db/bootstrap");
  return { client, bootstrap };
}

afterEach(async () => {
  try {
    const client = await import("@/db/client");
    await client.closeDb().catch(() => undefined);
  } finally {
    delete (globalThis as typeof globalThis & { __hansanV4Ready?: Promise<void> })
      .__hansanV4Ready;
    setOrDeleteEnv("HANSAN_PGLITE_DIR", originalEnv.dir);
    setOrDeleteEnv("HANSAN_DB_DRIVER", originalEnv.driver);
    setOrDeleteEnv("HANSAN_AUTO_MIGRATE", originalEnv.autoMigrate);
    setOrDeleteEnv("HANSAN_DEMO_MODE", originalEnv.demoMode);
    setOrDeleteEnv("NODE_ENV", originalEnv.nodeEnv);
    vi.doUnmock("@electric-sql/pglite");
    vi.doUnmock("drizzle-orm/pglite");
    vi.doUnmock("drizzle-orm/pglite/migrator");
    vi.resetModules();
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("PGlite failed initialization lifecycle", () => {
  it("releases the lock when the PGlite constructor throws", async () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const state: MockState = {
      constructorError: new Error("constructor failed"),
      readyError: null,
      migrationError: null,
      closeError: null,
      constructorCalls: 0,
      closeCalls: 0,
    };
    const { bootstrap } = await loadDatabaseMocks(state, dataDir);

    await expect(bootstrap.ensureDatabaseReady()).rejects.toThrow("constructor failed");

    expect(state.constructorCalls).toBe(1);
    expect(state.closeCalls).toBe(0);
    expect(existsSync(`${resolve(dataDir)}.hansan.lock`)).toBe(false);
  });

  it("closes and evicts an instance when waitReady rejects", async () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const state: MockState = {
      constructorError: null,
      readyError: new Error("readiness failed"),
      migrationError: null,
      closeError: null,
      constructorCalls: 0,
      closeCalls: 0,
    };
    const { client, bootstrap } = await loadDatabaseMocks(state, dataDir);

    await expect(bootstrap.ensureDatabaseReady()).rejects.toThrow("readiness failed");

    expect(state.closeCalls).toBe(1);
    expect(existsSync(`${resolve(dataDir)}.hansan.lock`)).toBe(false);
    state.readyError = null;
    expect(() => client.getDbHandle()).not.toThrow();
    expect(state.constructorCalls).toBe(2);
  });

  it("closes and evicts an instance when migration rejects", async () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const state: MockState = {
      constructorError: null,
      readyError: null,
      migrationError: new Error("migration failed"),
      closeError: null,
      constructorCalls: 0,
      closeCalls: 0,
    };
    const { client, bootstrap } = await loadDatabaseMocks(state, dataDir);

    await expect(bootstrap.ensureDatabaseReady()).rejects.toThrow("migration failed");

    expect(state.closeCalls).toBe(1);
    expect(existsSync(`${resolve(dataDir)}.hansan.lock`)).toBe(false);
    state.migrationError = null;
    expect(() => client.getDbHandle()).not.toThrow();
    expect(state.constructorCalls).toBe(2);
  });

  it("evicts an instance but keeps its lock if database close fails", async () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const state: MockState = {
      constructorError: null,
      readyError: new Error("readiness failed"),
      migrationError: null,
      closeError: new Error("close failed"),
      constructorCalls: 0,
      closeCalls: 0,
    };
    const { client, bootstrap } = await loadDatabaseMocks(state, dataDir);

    await expect(bootstrap.ensureDatabaseReady()).rejects.toThrow(
      "Database initialization failed and the database handle could not be closed safely.",
    );

    expect(state.closeCalls).toBe(1);
    expect(existsSync(`${resolve(dataDir)}.hansan.lock`)).toBe(true);
    expect(() => client.getDbHandle()).toThrow(/already in use|locked/);
  });

  it("shares one readiness promise between concurrent callers", async () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const state: MockState = {
      constructorError: null,
      readyError: null,
      migrationError: null,
      closeError: null,
      constructorCalls: 0,
      closeCalls: 0,
      resolveReady: () => undefined,
    };
    const { client, bootstrap } = await loadDatabaseMocks(state, dataDir);

    const first = bootstrap.ensureDatabaseReady();
    const second = bootstrap.ensureDatabaseReady();
    expect(second).toBe(first);
    expect(state.constructorCalls).toBe(1);

    state.resolveReady?.();
    await Promise.all([first, second]);
    expect(state.constructorCalls).toBe(1);
    await client.closeDb();
  });

  it("creates a fresh handle after a successful shutdown", async () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const state: MockState = {
      constructorError: null,
      readyError: null,
      migrationError: null,
      closeError: null,
      constructorCalls: 0,
      closeCalls: 0,
    };
    const { client, bootstrap } = await loadDatabaseMocks(state, dataDir);

    await bootstrap.ensureDatabaseReady();
    const firstHandle = client.getDbHandle();
    await client.closeDb();

    const secondHandle = client.getDbHandle();
    expect(secondHandle).not.toBe(firstHandle);
    expect(state.constructorCalls).toBe(2);
    await client.closeDb();
  });

  it("evicts the handle and retains the lock if an explicit close fails", async () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const state: MockState = {
      constructorError: null,
      readyError: null,
      migrationError: null,
      closeError: new Error("close failed"),
      constructorCalls: 0,
      closeCalls: 0,
    };
    const { client } = await loadDatabaseMocks(state, dataDir);
    const handle = client.getDbHandle();
    await handle.pglite?.waitReady;

    await expect(client.closeDb()).rejects.toThrow("Database close failed");

    expect(state.closeCalls).toBe(1);
    expect(existsSync(`${resolve(dataDir)}.hansan.lock`)).toBe(true);
    expect(() => client.getDbHandle()).toThrow(/already in use|locked/);
  });
});

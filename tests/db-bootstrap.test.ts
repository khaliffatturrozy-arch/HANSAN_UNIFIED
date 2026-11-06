import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, getDbHandle } from "@/db/client";
import { preparePgliteDirectory } from "@/db/pglite-directory";
import {
  acquirePgliteDirectoryLock,
  decidePgliteLockRecovery,
  parsePgliteLock,
} from "@/db/pglite-lock";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "hansan-db-bootstrap-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("PGlite startup directory", () => {
  it("creates missing parents before opening and preserves data after reopen", async () => {
    const root = makeRoot();
    const dataDir = join(root, "missing", "parents", "pglite");
    expect(existsSync(dirname(dataDir))).toBe(false);

    const prepared = preparePgliteDirectory(dataDir);
    expect(prepared).toBe(resolve(dataDir));
    expect(existsSync(dirname(prepared))).toBe(true);

    const first = new PGlite(prepared);
    try {
      await first.waitReady;
      await first.exec(
        "create table bootstrap_probe (value text not null); insert into bootstrap_probe values ('preserved');",
      );
    } finally {
      await first.close();
    }

    const reopened = new PGlite(preparePgliteDirectory(dataDir));
    try {
      await reopened.waitReady;
      const result = await reopened.query<{ value: string }>(
        "select value from bootstrap_probe",
      );
      expect(result.rows).toEqual([{ value: "preserved" }]);
    } finally {
      await reopened.close();
    }
  });

  it("preserves migration history and reapplies no migration after restart", async () => {
    const root = makeRoot();
    const dataDir = join(root, "persistent", "pglite");
    const migrationsFolder = resolve(process.cwd(), "drizzle");
    const first = new PGlite(preparePgliteDirectory(dataDir));
    let firstHistory: { hash: string; created_at: number }[];

    try {
      await first.waitReady;
      await migrate(drizzle(first), { migrationsFolder });
      firstHistory = (
        await first.query<{ hash: string; created_at: number }>(
          'select hash, created_at from "drizzle"."__drizzle_migrations" order by id',
        )
      ).rows;
      expect(firstHistory.length).toBeGreaterThan(0);
    } finally {
      await first.close();
    }

    const reopened = new PGlite(preparePgliteDirectory(dataDir));
    try {
      await reopened.waitReady;
      await migrate(drizzle(reopened), { migrationsFolder });
      const reopenedHistory = (
        await reopened.query<{ hash: string; created_at: number }>(
          'select hash, created_at from "drizzle"."__drizzle_migrations" order by id',
        )
      ).rows;

      expect(reopenedHistory).toEqual(firstHistory!);
    } finally {
      await reopened.close();
    }
  });

  it("leaves an existing data directory and its files untouched", () => {
    const root = makeRoot();
    const dataDir = join(root, "nested", "pglite");
    mkdirSync(dataDir, { recursive: true });
    const sentinel = join(dataDir, "sentinel.txt");
    writeFileSync(sentinel, "keep", "utf8");

    expect(preparePgliteDirectory(dataDir)).toBe(resolve(dataDir));
    expect(existsSync(dataDir)).toBe(true);
    expect(readFileSync(sentinel, "utf8")).toBe("keep");
  });

  it.runIf(process.platform === "win32")(
    "restores write access when Windows marks the data directory read-only",
    () => {
      const root = makeRoot();
      const dataDir = join(root, "onedrive", "pglite");
      mkdirSync(dataDir, { recursive: true });
      // OneDrive sets the ReadOnly attribute on synced folders, which Node
      // exposes as a missing write bit. PGlite mounts the directory read-only.
      chmodSync(dataDir, 0o555);
      expect(statSync(dataDir).mode & 0o200).toBe(0);

      const prepared = preparePgliteDirectory(dataDir);

      expect(prepared).toBe(resolve(dataDir));
      expect(statSync(prepared).mode & 0o200).not.toBe(0);
    },
  );

  it("reports an explicit error when the directory cannot be prepared", () => {
    const root = makeRoot();
    const blocker = join(root, "not-a-directory");
    writeFileSync(blocker, "file", "utf8");

    expect(() => preparePgliteDirectory(join(blocker, "pglite"))).toThrow(
      /Unable to prepare the PGlite data directory/,
    );
  });
});

describe("PGlite process lock", () => {
  it("classifies active, stale, and uncertain lock evidence without deleting locks", () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const releaseOwner = acquirePgliteDirectoryLock(dataDir);
    const lockPath = `${resolve(dataDir)}.hansan.lock`;

    try {
      const contents = readFileSync(lockPath, "utf8");
      const record = parsePgliteLock(contents);
      expect(record).not.toBeNull();
      const activeEvidence = {
        ownerProcessExists: true,
        ownerProcessStartedAt: record!.processStartedAt,
        ownerDatabaseDirectory: record!.databaseDirectory,
        noProcessUsesDatabase: false,
      };

      expect(decidePgliteLockRecovery(contents, dataDir, activeEvidence).status).toBe("active");
      expect(
        decidePgliteLockRecovery(contents, dataDir, {
          ...activeEvidence,
          ownerProcessStartedAt: new Date(Date.parse(record!.processStartedAt) + 60_000).toISOString(),
          noProcessUsesDatabase: true,
        }).status,
      ).toBe("stale");
      expect(
        decidePgliteLockRecovery(contents, dataDir, {
          ...activeEvidence,
          ownerProcessStartedAt: null,
        }).status,
      ).toBe("uncertain");
      expect(
        decidePgliteLockRecovery(contents, join(root, "other-db"), {
          ...activeEvidence,
          noProcessUsesDatabase: true,
        }).status,
      ).toBe("uncertain");
      expect(
        decidePgliteLockRecovery("{invalid", dataDir, {
          ...activeEvidence,
          noProcessUsesDatabase: true,
        }).status,
      ).toBe("uncertain");
      expect(existsSync(lockPath)).toBe(true);
    } finally {
      releaseOwner();
    }
  });

  it("prevents a second process from opening the same directory", async () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const releaseOwner = acquirePgliteDirectoryLock(dataDir);
    const childScript = [
      'import { acquirePgliteDirectoryLock } from "./src/db/pglite-lock.ts";',
      `try { acquirePgliteDirectoryLock(${JSON.stringify(dataDir)}); console.log("UNEXPECTED_ACQUIRE"); }`,
      'catch (error) { console.log(error.message); }',
    ].join("\n");
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", childScript],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
    );
    let childOutput = "";
    child.stdout.on("data", (chunk: Buffer) => {
      childOutput += chunk.toString();
    });

    try {
      const [exitCode] = await once(child, "close");
      expect(exitCode).toBe(0);
      expect(childOutput).toMatch(/is locked \(owner PID \d+/);
    } finally {
      releaseOwner();
    }

    const release = acquirePgliteDirectoryLock(dataDir);
    release();
  });

  it("atomically admits only one of two processes racing for the same directory", async () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const childScript = [
      'import { acquirePgliteDirectoryLock } from "./src/db/pglite-lock.ts";',
      "await new Promise((resolve) => setTimeout(resolve, 1000));",
      "try {",
      `  const release = acquirePgliteDirectoryLock(${JSON.stringify(dataDir)});`,
      '  console.log("ACQUIRED");',
      "  setTimeout(() => release(), 2000);",
      "} catch {",
      '  console.log("LOCKED");',
      "}",
    ].join("\n");
    const children = Array.from({ length: 2 }, () =>
      spawn(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", childScript],
        { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
    const outcomes = await Promise.all(
      children.map(async (child) => {
        let output = "";
        child.stdout.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        const [exitCode] = await once(child, "close");
        return { exitCode, output };
      }),
    );

    expect(outcomes.every((outcome) => outcome.exitCode === 0)).toBe(true);
    expect(outcomes.filter((outcome) => outcome.output.includes("ACQUIRED"))).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.output.includes("LOCKED"))).toHaveLength(1);
    expect(existsSync(`${resolve(dataDir)}.hansan.lock`)).toBe(false);
  });

  it("does not remove a replacement lock owned by another process", () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const release = acquirePgliteDirectoryLock(dataDir);
    const lockPath = `${resolve(dataDir)}.hansan.lock`;
    const current = parsePgliteLock(readFileSync(lockPath, "utf8"));
    expect(current).not.toBeNull();

    const replacement = JSON.stringify({ ...current!, token: `${current!.token}-replacement` });
    writeFileSync(lockPath, replacement, "utf8");
    release();

    expect(readFileSync(lockPath, "utf8")).toBe(replacement);
  });

  it("releases its lock when the owning process exits normally", async () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const childScript = [
      'import { acquirePgliteDirectoryLock } from "./src/db/pglite-lock.ts";',
      `acquirePgliteDirectoryLock(${JSON.stringify(dataDir)});`,
      "process.exit(0);",
    ].join("\n");
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", childScript],
      { cwd: process.cwd(), stdio: "ignore" },
    );

    const [exitCode] = await once(child, "close");

    expect(exitCode).toBe(0);
    expect(existsSync(`${resolve(dataDir)}.hansan.lock`)).toBe(false);
  });

  it("reopens persistent data in a new process after a clean database shutdown", async () => {
    const root = makeRoot();
    const dataDir = join(root, "pglite");
    const initial = new PGlite(preparePgliteDirectory(dataDir));
    try {
      await initial.waitReady;
      await initial.exec(
        "create table restart_probe (value text not null); insert into restart_probe values ('preserved');",
      );
    } finally {
      await initial.close();
    }

    const childScript = [
      'import { ensureDatabaseReady } from "./src/db/bootstrap.ts";',
      'import { closeDb, getDb } from "./src/db/client.ts";',
      'import { sql } from "drizzle-orm";',
      "await ensureDatabaseReady();",
      'const result = await getDb().execute(sql.raw("select value from restart_probe"));',
      'console.log(JSON.stringify(result.rows));',
      "await closeDb();",
    ].join("\n");
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", childScript],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          HANSAN_PGLITE_DIR: dataDir,
          HANSAN_DB_DRIVER: "pglite",
          HANSAN_AUTO_MIGRATE: "true",
          HANSAN_DEMO_MODE: "false",
          NODE_ENV: "test",
        },
      },
    );
    let childOutput = "";
    let childError = "";
    child.stdout.on("data", (chunk: Buffer) => {
      childOutput += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      childError += chunk.toString();
    });
    const [exitCode] = await once(child, "close");

    expect(exitCode, childError).toBe(0);
    expect(childOutput).toContain('[{"value":"preserved"}]');
    expect(existsSync(`${resolve(dataDir)}.hansan.lock`)).toBe(false);
  });

  it("holds the process lock until the PGlite handle closes", async () => {
    const root = makeRoot();
    const dataDir = join(root, "nested", "pglite");
    const previousDir = process.env.HANSAN_PGLITE_DIR;
    process.env.HANSAN_PGLITE_DIR = dataDir;

    try {
      const handle = getDbHandle();
      await handle.pglite?.waitReady;
      expect(existsSync(`${resolve(dataDir)}.hansan.lock`)).toBe(true);

      await closeDb();

      expect(existsSync(`${resolve(dataDir)}.hansan.lock`)).toBe(false);
    } finally {
      if (previousDir === undefined) {
        delete process.env.HANSAN_PGLITE_DIR;
      } else {
        process.env.HANSAN_PGLITE_DIR = previousDir;
      }
    }
  });
});

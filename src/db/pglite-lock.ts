import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

interface HeldLock {
  path: string;
  contents: string;
  released: boolean;
}

export interface PgliteLockRecord {
  version: 1;
  databaseDirectory: string;
  pid: number;
  processStartedAt: string;
  token: string;
}

export interface PgliteLockRecoveryEvidence {
  ownerProcessExists: boolean | null;
  ownerProcessStartedAt: string | null;
  ownerDatabaseDirectory: string | null;
  noProcessUsesDatabase: boolean;
}

export type PgliteLockRecoveryDecision =
  | { status: "active"; reason: string }
  | { status: "stale"; reason: string }
  | { status: "uncertain"; reason: string };

const heldLocks = new Set<HeldLock>();
let exitHandlerInstalled = false;

function canonicalPath(path: string): string {
  const absolutePath = resolve(path);
  if (existsSync(absolutePath)) return realpathSync(absolutePath);
  return resolve(realpathSync(dirname(absolutePath)), basename(absolutePath));
}

function normalizedPath(path: string): string {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

export function parsePgliteLock(contents: string): PgliteLockRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    return null;
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Partial<PgliteLockRecord>;
  if (
    record.version !== 1 ||
    typeof record.databaseDirectory !== "string" ||
    typeof record.pid !== "number" ||
    !Number.isSafeInteger(record.pid) ||
    record.pid <= 0 ||
    typeof record.processStartedAt !== "string" ||
    !Number.isFinite(Date.parse(record.processStartedAt)) ||
    typeof record.token !== "string" ||
    record.token.length === 0
  ) {
    return null;
  }

  return record as PgliteLockRecord;
}

function processStartMatches(recorded: string, observed: string): boolean {
  const recordedAt = Date.parse(recorded);
  const observedAt = Date.parse(observed);
  return Number.isFinite(observedAt) && Math.abs(recordedAt - observedAt) <= 2_000;
}

/**
 * Classifies a lock for operator-guided recovery. This function never removes
 * the lock; uncertain evidence must remain fail-closed.
 */
export function decidePgliteLockRecovery(
  contents: string,
  expectedDirectory: string,
  evidence: PgliteLockRecoveryEvidence,
): PgliteLockRecoveryDecision {
  const record = parsePgliteLock(contents);
  if (!record) {
    return { status: "uncertain", reason: "Lock contents are missing or invalid." };
  }

  let expectedPath: string;
  let recordedPath: string;
  try {
    expectedPath = normalizedPath(canonicalPath(expectedDirectory));
    recordedPath = normalizedPath(record.databaseDirectory);
  } catch {
    return {
      status: "uncertain",
      reason: "The expected database path cannot be resolved.",
    };
  }

  if (recordedPath !== expectedPath) {
    return {
      status: "uncertain",
      reason: "The lock records a different database path.",
    };
  }

  if (evidence.ownerProcessExists === null) {
    return {
      status: "uncertain",
      reason: "The lock owner's process state could not be verified.",
    };
  }

  if (evidence.ownerProcessExists) {
    if (!evidence.ownerProcessStartedAt) {
      return {
        status: "uncertain",
        reason: "The owner process start time could not be verified.",
      };
    }

    if (processStartMatches(record.processStartedAt, evidence.ownerProcessStartedAt)) {
      if (
        !evidence.ownerDatabaseDirectory ||
        normalizedPath(evidence.ownerDatabaseDirectory) !== expectedPath
      ) {
        return {
          status: "uncertain",
          reason: "The live owner process database path could not be verified.",
        };
      }

      return {
        status: "active",
        reason: "PID, process start time, and database path match the lock.",
      };
    }
  }

  if (!evidence.noProcessUsesDatabase) {
    return {
      status: "uncertain",
      reason: "No-process-use verification is required before stale-lock recovery.",
    };
  }

  return {
    status: "stale",
    reason: evidence.ownerProcessExists
      ? "The PID belongs to a later process; the recorded owner process has exited."
      : "The recorded owner process is absent and no process uses the database.",
  };
}

function releaseLock(lock: HeldLock): void {
  if (lock.released) return;

  try {
    if (readFileSync(lock.path, "utf8") === lock.contents) {
      unlinkSync(lock.path);
    }
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }

  lock.released = true;
  heldLocks.delete(lock);
}

function installExitHandler(): void {
  if (exitHandlerInstalled) return;
  exitHandlerInstalled = true;

  process.once("exit", () => {
    for (const lock of heldLocks) {
      try {
        releaseLock(lock);
      } catch (error) {
        console.error(`[db] unable to release PGlite lock "${lock.path}"`, error);
      }
    }
  });
}

/**
 * HANSAN permits one app or migration process per file-backed PGlite directory.
 * The exclusive sidecar lock rejects concurrent use before PGlite opens the
 * directory. A stale lock is deliberately not removed automatically.
 */
export function acquirePgliteDirectoryLock(dataDir: string): () => void {
  if (dataDir.includes("://")) return () => undefined;

  const absoluteDir = canonicalPath(dataDir);
  const lockPath = `${absoluteDir}.hansan.lock`;
  const contents = JSON.stringify({
    version: 1,
    databaseDirectory: absoluteDir,
    pid: process.pid,
    processStartedAt: new Date(Date.now() - process.uptime() * 1_000).toISOString(),
    token: randomUUID(),
  } satisfies PgliteLockRecord);
  let fd: number;

  try {
    fd = openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if (isNodeError(error, "EEXIST")) {
      let ownerDescription = "owner metadata unavailable";
      try {
        const existing = parsePgliteLock(readFileSync(lockPath, "utf8"));
        if (existing) {
          ownerDescription = `owner PID ${existing.pid}, started ${existing.processStartedAt}, database "${existing.databaseDirectory}"`;
        }
      } catch (readError) {
        if (!isNodeError(readError, "ENOENT")) throw readError;
      }

      throw new Error(
        `PGlite data directory "${absoluteDir}" is locked (${ownerDescription}). Refusing to open it. Verify the process start time and database path before considering manual removal of "${lockPath}"; never remove database files.`,
        { cause: error },
      );
    }
    throw new Error(`Unable to acquire the PGlite lock "${lockPath}"`, { cause: error });
  }

  try {
    writeFileSync(fd, contents, "utf8");
    closeSync(fd);
  } catch (error) {
    try {
      closeSync(fd);
    } catch (closeError) {
      if (!isNodeError(closeError, "EBADF")) {
        console.error(`[db] unable to close PGlite lock "${lockPath}"`, closeError);
      }
    }
    try {
      unlinkSync(lockPath);
    } catch (unlinkError) {
      if (!isNodeError(unlinkError, "ENOENT")) {
        console.error(`[db] unable to remove incomplete PGlite lock "${lockPath}"`, unlinkError);
      }
    }
    throw new Error(`Unable to write the PGlite lock "${lockPath}"`, { cause: error });
  }

  const lock: HeldLock = { path: lockPath, contents, released: false };
  heldLocks.add(lock);
  installExitHandler();
  return () => releaseLock(lock);
}

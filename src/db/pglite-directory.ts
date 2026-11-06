import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * PGlite creates its own data directory, but not missing parents. Create the
 * parent recursively before opening the database so a fresh checkout does not
 * fail on `.data/pglite`. Existing database directories and files are left
 * untouched.
 *
 * URL-style locations such as `memory://` are passed through to PGlite.
 */
export function preparePgliteDirectory(dataDir: string): string {
  if (dataDir.includes("://")) return dataDir;

  const absoluteDir = resolve(dataDir);

  try {
    mkdirSync(dirname(absoluteDir), { recursive: true });

    // PGlite's WASM filesystem derives mount permissions from the Node mode
    // bits. On Windows, OneDrive and some archive tools mark folders with the
    // ReadOnly attribute, so Node reports no write bit even though the OS
    // allows writes. PGlite then fails to create postmaster.pid with an opaque
    // "Permission denied". Clearing the attribute on the dedicated data
    // directory restores the expected mode without touching database files.
    if (
      process.platform === "win32" &&
      existsSync(absoluteDir) &&
      (statSync(absoluteDir).mode & 0o200) === 0
    ) {
      chmodSync(absoluteDir, 0o755);
    }
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Unable to prepare the PGlite data directory "${absoluteDir}": ${reason}`,
      { cause },
    );
  }

  return absoluteDir;
}

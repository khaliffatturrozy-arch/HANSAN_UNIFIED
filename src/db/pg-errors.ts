/**
 * PostgreSQL driver errors can arrive directly from `pg` or wrapped by
 * Drizzle's `DrizzleQueryError`, which keeps the driver error in `cause`.
 * These helpers inspect the cause chain without depending on a specific driver.
 */

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  cause?: unknown;
}

const MAX_CAUSE_DEPTH = 5;

export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!current || typeof current !== "object") return undefined;
    const candidate = current as ErrorLike;
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }
  return undefined;
}

export function isPgUniqueViolation(error: unknown): boolean {
  if (pgErrorCode(error) === "23505") return true;

  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!current || typeof current !== "object") return false;
    const candidate = current as ErrorLike;
    if (
      typeof candidate.message === "string" &&
      candidate.message.includes("duplicate key")
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

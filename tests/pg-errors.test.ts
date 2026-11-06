import { describe, expect, it } from "vitest";
import { isPgUniqueViolation, pgErrorCode } from "@/db/pg-errors";

describe("PostgreSQL error unwrapping", () => {
  it("finds the driver code on a Drizzle-wrapped error", () => {
    const driverError = Object.assign(
      new Error("duplicate key value violates unique constraint"),
      { code: "23505" },
    );
    const wrapped = new Error("Failed query: insert into tenants", {
      cause: driverError,
    });

    expect(pgErrorCode(wrapped)).toBe("23505");
    expect(isPgUniqueViolation(wrapped)).toBe(true);
  });

  it("recognizes direct driver errors and rejects unrelated errors", () => {
    const direct = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    });

    expect(isPgUniqueViolation(direct)).toBe(true);
    expect(isPgUniqueViolation(new Error("network failure"))).toBe(false);
    expect(pgErrorCode(new Error("network failure"))).toBeUndefined();
  });
});

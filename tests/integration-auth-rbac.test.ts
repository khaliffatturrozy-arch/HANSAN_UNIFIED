import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { TestDatabase } from "./helpers/db";
import { createTestDatabase } from "./helpers/db";
import { seedDemo } from "@/db/seed";
import { outlets, products, sessions, users } from "@/db/schema";
import { login } from "@/modules/identity/auth-service";
import { getDemoCredentials } from "@/modules/identity/demo-accounts";
import {
  csrfMatches,
  resolveSession,
  revokeSession,
  sha256,
} from "@/modules/identity/session";
import {
  assertOutletAccess,
  can,
  canAccessOutlet,
  isTenantAdmin,
  ROLE_PERMISSIONS,
} from "@/modules/identity/rbac";
import { AppError } from "@/modules/shared/errors";

let database: TestDatabase;

const originalDemoMode = process.env.HANSAN_DEMO_MODE;
const originalDemoPassword = process.env.HANSAN_DEMO_PASSWORD;
const testDemoPassword = `test-${randomBytes(18).toString("base64url")}`;

beforeAll(async () => {
  process.env.HANSAN_DEMO_MODE = "true";
  process.env.HANSAN_DEMO_PASSWORD = testDemoPassword;
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.close();

  if (originalDemoMode === undefined) delete process.env.HANSAN_DEMO_MODE;
  else process.env.HANSAN_DEMO_MODE = originalDemoMode;

  if (originalDemoPassword === undefined) delete process.env.HANSAN_DEMO_PASSWORD;
  else process.env.HANSAN_DEMO_PASSWORD = originalDemoPassword;
});

describe("demo seed", () => {
  it("is idempotent and creates a complete demo tenant", async () => {
    const first = await seedDemo(database.db);
    const second = await seedDemo(database.db);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.tenantId).toBe(first.tenantId);
    expect(second.outletIds).toHaveLength(2);

    const userRows = await database.db.select().from(users);
    const outletRows = await database.db.select().from(outlets).where(eq(outlets.tenantId, first.tenantId));
    const productRows = await database.db.select().from(products).where(eq(products.tenantId, first.tenantId));

    const credentials = getDemoCredentials();
    expect(userRows).toHaveLength(credentials.length);
    expect(outletRows).toHaveLength(2);
    expect(productRows).toHaveLength(10);
    expect(credentials.every((entry) => entry.password === testDemoPassword)).toBe(true);
  });
});

describe("authentication and sessions", () => {
  it("signs in with a seeded operator, stores only token hashes, and resolves the actor", async () => {
    const credential = getDemoCredentials().find((entry) => entry.email === "owner@demo.hansan.id");
    expect(credential).toBeDefined();

    const result = await login(
      database.db,
      { email: credential!.email, password: credential!.password },
      "203.0.113.10",
    );

    expect(result.actor.role).toBe("owner");
    expect(result.actor.tenantName).toContain("HANSAN");
    expect(result.actor.grantedOutletIds).toHaveLength(2);
    expect(result.session.token).not.toBe(result.session.csrfToken);

    const stored = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, sha256(result.session.token)));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).not.toBe(result.session.token);
    expect(stored[0]?.csrfHash).not.toBe(result.session.csrfToken);

    const resolved = await resolveSession(database.db, result.session.token);
    expect(resolved?.actor.userId).toBe(result.actor.userId);
    expect(resolved?.actor.role).toBe("owner");
    expect(csrfMatches(result.session.csrfToken, resolved!.csrfHash)).toBe(true);
    expect(csrfMatches("wrong-token", resolved!.csrfHash)).toBe(false);

    await revokeSession(database.db, result.session.token);
    expect(await resolveSession(database.db, result.session.token)).toBeNull();
  });

  it("gives an indistinguishable error for a wrong password and an unknown account", async () => {
    const wrongPassword = await login(
      database.db,
      { email: "owner@demo.hansan.id", password: "ThisIsNotThePassword1!" },
      "203.0.113.11",
    ).catch((error: unknown) => error);
    const unknown = await login(
      database.db,
      { email: "nobody@demo.hansan.id", password: "ThisIsNotThePassword1!" },
      "203.0.113.12",
    ).catch((error: unknown) => error);

    expect(wrongPassword).toBeInstanceOf(AppError);
    expect(unknown).toBeInstanceOf(AppError);
    expect((wrongPassword as AppError).message).toBe((unknown as AppError).message);
    expect((wrongPassword as AppError).code).toBe("UNAUTHENTICATED");
  });

  it("rejects an empty or oversized session token", async () => {
    expect(await resolveSession(database.db, "")).toBeNull();
    expect(await resolveSession(database.db, "x".repeat(201))).toBeNull();
  });
});

describe("role and outlet policy", () => {
  it("keeps finance read-only and cashiers out of HQ and kitchen", () => {
    expect(can("finance", "hq:view_finance")).toBe(true);
    expect(can("finance", "hq:manage_catalog")).toBe(false);
    expect(can("cashier", "pos:operate")).toBe(true);
    expect(can("cashier", "hq:view")).toBe(false);
    expect(can("cashier", "kds:view")).toBe(false);
    expect(can("kitchen", "kds:operate")).toBe(true);
    expect(can("kitchen", "pos:operate")).toBe(false);
    expect(can("org_admin", "pos:refund")).toBe(false);
    expect(can("owner", "pos:refund")).toBe(true);
  });

  it("grants tenant-wide outlet access only to admins", async () => {
    const demo = await database.db.select().from(outlets).limit(2);
    const actor = {
      userId: "user",
      membershipId: "membership",
      tenantId: "tenant",
      tenantName: "Tenant",
      outletId: demo[0]!.id,
      outletName: demo[0]!.name,
      displayName: "Cashier",
      email: "cashier@test.invalid",
      role: "cashier" as const,
      grantedOutletIds: [demo[0]!.id],
    };

    expect(canAccessOutlet(actor, demo[0]!.id)).toBe(true);
    expect(canAccessOutlet(actor, demo[1]!.id)).toBe(false);
    expect(() => assertOutletAccess(actor, demo[1]!.id)).toThrow();
    expect(canAccessOutlet({ ...actor, role: "owner" }, demo[1]!.id)).toBe(true);
    expect(isTenantAdmin("org_admin")).toBe(true);
    expect(isTenantAdmin("outlet_manager")).toBe(false);
    expect(Object.keys(ROLE_PERMISSIONS)).toHaveLength(7);
  });
});

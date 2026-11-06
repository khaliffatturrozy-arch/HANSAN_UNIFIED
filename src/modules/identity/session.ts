import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { memberships, outletGrants, outlets, sessions, tenants, users } from "@/db/schema";
import { AppError, ERROR_CODES } from "@/modules/shared/errors";
import { isRole, isTenantAdmin, type Actor } from "./rbac";

export const SESSION_COOKIE = "hansan_session";
export const CSRF_COOKIE = "hansan_csrf";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface CreatedSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

export async function createSession(
  db: AppDb,
  input: { userId: string; membershipId: string; outletId: string },
): Promise<CreatedSession> {
  const token = generateToken();
  const csrfToken = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    userId: input.userId,
    membershipId: input.membershipId,
    outletId: input.outletId,
    tokenHash: sha256(token),
    csrfHash: sha256(csrfToken),
    expiresAt,
  });
  return { token, csrfToken, expiresAt };
}

export interface ResolvedSession {
  actor: Actor;
  sessionId: string;
  csrfHash: string;
  expiresAt: Date;
}

export async function resolveSession(db: AppDb, token: string): Promise<ResolvedSession | null> {
  if (!token || token.length > 200) return null;
  const rows = await db
    .select({
      sessionId: sessions.id,
      csrfHash: sessions.csrfHash,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      userActive: users.active,
      membershipId: memberships.id,
      tenantId: memberships.tenantId,
      role: memberships.role,
      tenantName: tenants.name,
      tenantStatus: tenants.status,
      outletId: outlets.id,
      outletName: outlets.name,
      outletTenantId: outlets.tenantId,
      outletActive: outlets.active,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(memberships, eq(sessions.membershipId, memberships.id))
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .innerJoin(outlets, eq(sessions.outletId, outlets.id))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
  if (!row.userActive || row.tenantStatus !== "active" || !row.outletActive) return null;
  if (row.outletTenantId !== row.tenantId) return null;
  if (!isRole(row.role)) return null;

  const grantedRows = await db
    .select({ outletId: outletGrants.outletId })
    .from(outletGrants)
    .where(eq(outletGrants.membershipId, row.membershipId));

  const grantedOutletIds = grantedRows.map((grant) => grant.outletId);
  if (!isTenantAdmin(row.role) && !grantedOutletIds.includes(row.outletId)) {
    return null;
  }

  return {
    sessionId: row.sessionId,
    csrfHash: row.csrfHash,
    expiresAt: row.expiresAt,
    actor: {
      userId: row.userId,
      membershipId: row.membershipId,
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      outletId: row.outletId,
      outletName: row.outletName,
      role: row.role,
      displayName: row.displayName,
      email: row.email,
      grantedOutletIds,
    },
  };
}

export async function revokeSession(db: AppDb, token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, sha256(token)));
}

export function csrfMatches(headerToken: string | null, storedHash: string): boolean {
  if (!headerToken || headerToken.length > 200) return false;
  const actual = Buffer.from(sha256(headerToken), "utf8");
  const expected = Buffer.from(storedHash, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function requireCsrf(headerToken: string | null, storedHash: string): void {
  if (!csrfMatches(headerToken, storedHash)) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Invalid CSRF token");
  }
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function csrfCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

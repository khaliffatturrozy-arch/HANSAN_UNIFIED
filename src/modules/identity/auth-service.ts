import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import { memberships, outletGrants, outlets, tenants, users } from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { AppError, ERROR_CODES } from "@/modules/shared/errors";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "./password";
import { isRole, type Actor, type Role } from "./rbac";
import { createSession, type CreatedSession } from "./session";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254).email(),
  password: z.string().min(10).max(256),
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface LoginResult {
  actor: Actor;
  session: CreatedSession;
}

const ROLE_PRIORITY: Record<Role, number> = {
  owner: 0,
  org_admin: 1,
  finance: 2,
  outlet_manager: 3,
  cashier: 4,
  kitchen: 5,
  bar: 6,
};

/**
 * Authenticate with email/password and issue a server-side session.
 * Responses for unknown users, wrong passwords, and users without an active
 * outlet are deliberately indistinguishable.
 */
export async function login(db: AppDb, input: LoginInput, clientIp: string): Promise<LoginResult> {
  const ipBucket = rateLimit(`login:ip:${clientIp}`, 20, 10 * 60_000);
  const identityBucket = rateLimit(`login:id:${clientIp}:${input.email}`, 8, 10 * 60_000);
  if (!ipBucket.allowed || !identityBucket.allowed) {
    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      "Too many sign-in attempts. Try again later.",
      { retryAfterSeconds: Math.max(ipBucket.retryAfterSeconds, identityBucket.retryAfterSeconds) },
    );
  }

  const userRows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  const user = userRows[0];
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !user.active || !passwordOk) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Invalid email or password");
  }

  const membershipRows = await db
    .select({
      membershipId: memberships.id,
      tenantId: memberships.tenantId,
      role: memberships.role,
      tenantName: tenants.name,
    })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(and(eq(memberships.userId, user.id), eq(tenants.status, "active")));

  const validMemberships = membershipRows
    .filter((membership) => isRole(membership.role))
    .sort((a, b) => ROLE_PRIORITY[a.role as Role] - ROLE_PRIORITY[b.role as Role]);

  for (const membership of validMemberships) {
    const role = membership.role as Role;
    const isAdmin = role === "owner" || role === "org_admin";
    const outletRows = isAdmin
      ? await db
          .select({ id: outlets.id, name: outlets.name })
          .from(outlets)
          .where(and(eq(outlets.tenantId, membership.tenantId), eq(outlets.active, true)))
      : await db
          .select({ id: outlets.id, name: outlets.name })
          .from(outletGrants)
          .innerJoin(outlets, eq(outletGrants.outletId, outlets.id))
          .where(
            and(
              eq(outletGrants.membershipId, membership.membershipId),
              eq(outlets.active, true),
              eq(outlets.tenantId, membership.tenantId),
            ),
          );

    const outlet = outletRows[0];
    if (!outlet) continue;

    const grantedRows = await db
      .select({ outletId: outletGrants.outletId })
      .from(outletGrants)
      .where(eq(outletGrants.membershipId, membership.membershipId));

    const session = await createSession(db, {
      userId: user.id,
      membershipId: membership.membershipId,
      outletId: outlet.id,
    });

    return {
      session,
      actor: {
        userId: user.id,
        membershipId: membership.membershipId,
        tenantId: membership.tenantId,
        tenantName: membership.tenantName,
        outletId: outlet.id,
        outletName: outlet.name,
        role,
        displayName: user.displayName,
        email: user.email,
        grantedOutletIds: grantedRows.map((row) => row.outletId),
      },
    };
  }

  throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Invalid email or password");
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { readyDb } from "@/lib/server";
import { AppError, ERROR_CODES } from "@/modules/shared/errors";
import {
  CSRF_COOKIE,
  requireCsrf,
  resolveSession,
  SESSION_COOKIE,
  type ResolvedSession,
} from "@/modules/identity/session";
import { actorCan, homeForRole, type Actor, type Permission } from "@/modules/identity/rbac";

export async function authenticateRequest(request: NextRequest): Promise<ResolvedSession | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(await readyDb(), token);
}

export async function requireRequestSession(request: NextRequest): Promise<ResolvedSession> {
  const session = await authenticateRequest(request);
  if (!session) throw new AppError(ERROR_CODES.UNAUTHENTICATED, "Sign-in required");
  return session;
}

export function requireRequestCsrf(request: NextRequest, session: ResolvedSession): void {
  requireCsrf(request.headers.get("x-csrf-token"), session.csrfHash);
}

/** Server components/layouts. Always validates against the database. */
export async function getPageSession(): Promise<ResolvedSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(await readyDb(), token);
}

export async function requirePageSession(): Promise<ResolvedSession> {
  const session = await getPageSession();
  if (!session) redirect("/login");
  return session;
}

export function requirePagePermission(session: ResolvedSession, permission: Permission): void {
  if (!actorCan(session.actor, permission)) {
    redirect(homeForRole(session.actor.role));
  }
}

export function redirectHome(actor: Actor): never {
  redirect(homeForRole(actor.role));
}

export { CSRF_COOKIE };

import { NextRequest } from "next/server";
import { jsonError, jsonOk, assertSameOrigin, clientIp, readJson } from "@/lib/api";
import { readyDb } from "@/lib/server";
import { login, loginSchema } from "@/modules/identity/auth-service";
import { homeForRole } from "@/modules/identity/rbac";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  csrfCookieOptions,
  sessionCookieOptions,
} from "@/modules/identity/session";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = await readJson(request, loginSchema);
    const db = await readyDb();
    const result = await login(db, input, clientIp(request));

    const maxAgeSeconds = Math.max(
      1,
      Math.floor((result.session.expiresAt.getTime() - Date.now()) / 1000),
    );
    const response = jsonOk({
      actor: result.actor,
      csrfToken: result.session.csrfToken,
      redirectTo: homeForRole(result.actor.role),
    });
    response.cookies.set(SESSION_COOKIE, result.session.token, sessionCookieOptions(maxAgeSeconds));
    response.cookies.set(CSRF_COOKIE, result.session.csrfToken, csrfCookieOptions(maxAgeSeconds));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

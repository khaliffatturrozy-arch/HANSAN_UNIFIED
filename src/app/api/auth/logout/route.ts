import { NextRequest } from "next/server";
import { jsonError, jsonOk, assertSameOrigin } from "@/lib/api";
import { readyDb } from "@/lib/server";
import { requireRequestCsrf, requireRequestSession } from "@/lib/auth";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  csrfCookieOptions,
  revokeSession,
  sessionCookieOptions,
} from "@/modules/identity/session";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireRequestSession(request);
    requireRequestCsrf(request, session);

    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) await revokeSession(await readyDb(), token);

    const response = jsonOk({ signedOut: true });
    response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
    response.cookies.set(CSRF_COOKIE, "", csrfCookieOptions(0));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

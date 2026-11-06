import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, ERROR_CODES, HTTP_STATUS, isAppError } from "@/modules/shared/errors";

export function jsonOk<T>(data: T, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json(
    { ok: true, data },
    {
      status: init?.status ?? 200,
      headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
    },
  );
}

export function jsonError(error: unknown) {
  if (isAppError(error)) {
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (error.code === ERROR_CODES.RATE_LIMITED && typeof error.details?.retryAfterSeconds === "number") {
      headers["Retry-After"] = String(error.details.retryAfterSeconds);
    }
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: HTTP_STATUS[error.code], headers },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: ERROR_CODES.VALIDATION,
          message: "Request validation failed",
          details: { issues: error.issues },
        },
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error("[api] unhandled error", error);
  return NextResponse.json(
    { ok: false, error: { code: ERROR_CODES.INTERNAL, message: "Internal server error" } },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError(ERROR_CODES.VALIDATION, "Request body must be valid JSON");
  }
  return schema.parse(body);
}

/**
 * Defence-in-depth against cross-site form posts. Requests without an Origin
 * header are non-browser clients; authenticated mutations still require the
 * session-bound CSRF token.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) throw new AppError(ERROR_CODES.FORBIDDEN, "Missing host header");
  try {
    if (new URL(origin).host !== host) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "Cross-origin request rejected");
    }
  } catch (error) {
    if (isAppError(error)) throw error;
    throw new AppError(ERROR_CODES.FORBIDDEN, "Invalid origin");
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function noStoreRedirect(url: string) {
  return NextResponse.redirect(url, { status: 303 });
}

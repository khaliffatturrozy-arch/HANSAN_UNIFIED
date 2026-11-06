import { NextRequest } from "next/server";
import { clientIp, jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { readyDb } from "@/lib/server";
import { getPublicStorefront } from "@/modules/ordering/catalog";
import { AppError, ERROR_CODES } from "@/modules/shared/errors";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const limit = rateLimit(`public-catalog:${clientIp(request)}`, 120, 60_000);
    if (!limit.allowed) {
      throw new AppError(ERROR_CODES.RATE_LIMITED, "Too many requests. Please try again shortly.");
    }
    const { slug } = await context.params;
    const storefront = await getPublicStorefront(await readyDb(), slug);
    return jsonOk(storefront);
  } catch (error) {
    return jsonError(error);
  }
}

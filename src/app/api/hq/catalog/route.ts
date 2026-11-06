import { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, jsonOk, readJson } from "@/lib/api";
import { requireRequestCsrf, requireRequestSession } from "@/lib/auth";
import { readyDb } from "@/lib/server";
import {
  createProduct,
  createProductSchema,
  listCatalog,
  listCategories,
} from "@/modules/hq/hq-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await requireRequestSession(request);
    const db = await readyDb();
    const [products, categories] = await Promise.all([
      listCatalog(db, session.actor),
      listCategories(db, session.actor),
    ]);
    return jsonOk({ products, categories });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireRequestSession(request);
    requireRequestCsrf(request, session);
    const input = await readJson(request, createProductSchema);
    const product = await createProduct(await readyDb(), session.actor, input);
    return jsonOk({ product }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

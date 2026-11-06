import { z } from "zod";
import { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, jsonOk, readJson } from "@/lib/api";
import { requireRequestCsrf, requireRequestSession } from "@/lib/auth";
import { readyDb } from "@/lib/server";
import { setProductActive, toggleProductSchema } from "@/modules/hq/hq-service";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireRequestSession(request);
    requireRequestCsrf(request, session);
    const { id } = await context.params;
    const productId = z.uuid().parse(id);
    const input = await readJson(request, toggleProductSchema);
    const product = await setProductActive(await readyDb(), session.actor, productId, input.active);
    return jsonOk({ product });
  } catch (error) {
    return jsonError(error);
  }
}

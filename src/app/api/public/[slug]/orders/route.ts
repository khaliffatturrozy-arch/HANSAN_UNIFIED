import { NextRequest } from "next/server";
import { assertSameOrigin, clientIp, jsonError, jsonOk, readJson } from "@/lib/api";
import { readyDb } from "@/lib/server";
import { publicOrderSchema } from "@/modules/ordering/contracts";
import { createPublicOrder } from "@/modules/ordering/order-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    assertSameOrigin(request);
    const { slug } = await context.params;
    const input = await readJson(request, publicOrderSchema);
    const order = await createPublicOrder(await readyDb(), slug, input, clientIp(request));
    return jsonOk({ order }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

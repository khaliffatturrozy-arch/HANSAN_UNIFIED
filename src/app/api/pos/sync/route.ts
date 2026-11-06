import { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, jsonOk, readJson } from "@/lib/api";
import { requireRequestCsrf, requireRequestSession } from "@/lib/auth";
import { readyDb } from "@/lib/server";
import { syncRequestSchema } from "@/modules/ordering/contracts";
import { syncPosOrders } from "@/modules/ordering/order-service";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireRequestSession(request);
    requireRequestCsrf(request, session);
    const input = await readJson(request, syncRequestSchema);
    const result = await syncPosOrders(await readyDb(), session.actor, input);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

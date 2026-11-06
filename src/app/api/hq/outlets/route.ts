import { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, jsonOk, readJson } from "@/lib/api";
import { requireRequestCsrf, requireRequestSession } from "@/lib/auth";
import { readyDb } from "@/lib/server";
import { createOutlet, createOutletSchema, listOutlets } from "@/modules/hq/hq-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await requireRequestSession(request);
    return jsonOk({ outlets: await listOutlets(await readyDb(), session.actor) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await requireRequestSession(request);
    requireRequestCsrf(request, session);
    const input = await readJson(request, createOutletSchema);
    const outlet = await createOutlet(await readyDb(), session.actor, input);
    return jsonOk({ outlet }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

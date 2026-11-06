import { z } from "zod";
import { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, jsonOk, readJson } from "@/lib/api";
import { requireRequestCsrf, requireRequestSession } from "@/lib/auth";
import { readyDb } from "@/lib/server";
import { transitionTicket } from "@/modules/kitchen/kds-service";

const transitionSchema = z.object({
  to: z.enum(["queued", "accepted", "preparing", "ready", "completed"]),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireRequestSession(request);
    requireRequestCsrf(request, session);
    const { id } = await context.params;
    const ticketId = z.uuid().parse(id);
    const input = await readJson(request, transitionSchema);
    const ticket = await transitionTicket(await readyDb(), session.actor, ticketId, input.to);
    return jsonOk({ ticket });
  } catch (error) {
    return jsonError(error);
  }
}

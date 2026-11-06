import { z } from "zod";
import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { requireRequestSession } from "@/lib/auth";
import { readyDb } from "@/lib/server";
import { listKdsTickets } from "@/modules/kitchen/kds-service";

export const dynamic = "force-dynamic";

const stationSchema = z.enum(["kitchen", "bar"]);

export async function GET(request: NextRequest) {
  try {
    const session = await requireRequestSession(request);
    const params = request.nextUrl.searchParams;
    const outletId = params.get("outletId") ?? session.actor.outletId;
    const stationParam = params.get("station");
    const station = stationParam ? stationSchema.parse(stationParam) : undefined;

    const tickets = await listKdsTickets(await readyDb(), session.actor, {
      outletId,
      ...(station ? { station } : {}),
    });
    return jsonOk({ tickets, serverTime: new Date().toISOString() });
  } catch (error) {
    return jsonError(error);
  }
}

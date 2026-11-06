import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { requireRequestSession } from "@/lib/auth";
import { readyDb } from "@/lib/server";
import { getHqOverview } from "@/modules/hq/hq-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await requireRequestSession(request);
    return jsonOk(await getHqOverview(await readyDb(), session.actor));
  } catch (error) {
    return jsonError(error);
  }
}

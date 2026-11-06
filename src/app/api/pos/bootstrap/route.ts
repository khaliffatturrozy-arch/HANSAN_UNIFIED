import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { requireRequestSession } from "@/lib/auth";
import { readyDb } from "@/lib/server";
import { isDemoMode } from "@/lib/env";
import { outlets } from "@/db/schema";
import { getOutletCatalog } from "@/modules/ordering/catalog";
import { actorCan, assertOutletAccess, isTenantAdmin } from "@/modules/identity/rbac";

export const dynamic = "force-dynamic";

const outletIdSchema = z.uuid();

export async function GET(request: NextRequest) {
  try {
    const session = await requireRequestSession(request);
    const db = await readyDb();
    const requested = request.nextUrl.searchParams.get("outletId");
    const outletId = requested ? outletIdSchema.parse(requested) : session.actor.outletId;
    assertOutletAccess(session.actor, outletId);

    const [catalog, outletRows] = await Promise.all([
      getOutletCatalog(db, session.actor.tenantId, outletId),
      db
        .select({ id: outlets.id, name: outlets.name, code: outlets.code })
        .from(outlets)
        .where(and(eq(outlets.tenantId, session.actor.tenantId), eq(outlets.active, true))),
    ]);

    const visibleOutlets = outletRows.filter(
      (outlet) =>
        isTenantAdmin(session.actor.role) || session.actor.grantedOutletIds.includes(outlet.id),
    );

    return jsonOk({
      actor: session.actor,
      catalog,
      outlets: visibleOutlets,
      canDiscount: actorCan(session.actor, "pos:discount"),
      demoMode: isDemoMode(),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(error);
  }
}

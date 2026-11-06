import { requirePagePermission, requirePageSession } from "@/lib/auth";
import { actorCan } from "@/modules/identity/rbac";
import { KdsBoard } from "./kds-board";

export const metadata = { title: "Kitchen display" };
export const dynamic = "force-dynamic";

export default async function KdsPage() {
  const session = await requirePageSession();
  requirePagePermission(session, "kds:view");

  return (
    <KdsBoard
      actor={{
        displayName: session.actor.displayName,
        role: session.actor.role,
        outletId: session.actor.outletId,
        outletName: session.actor.outletName,
        tenantName: session.actor.tenantName,
      }}
      canViewHq={actorCan(session.actor, "hq:view")}
      canOperatePos={actorCan(session.actor, "pos:operate")}
    />
  );
}

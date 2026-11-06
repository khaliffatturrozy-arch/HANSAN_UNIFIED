import { requirePagePermission, requirePageSession } from "@/lib/auth";
import { readyDb } from "@/lib/server";
import { listOutlets } from "@/modules/hq/hq-service";
import { actorCan } from "@/modules/identity/rbac";
import { PageHeader, StatusBadge } from "@/components/ui";
import { formatBps, formatDateTime } from "@/lib/format";
import { NewOutletForm } from "./new-outlet-form";

export const metadata = { title: "Outlets" };
export const dynamic = "force-dynamic";

export default async function OutletsPage() {
  const session = await requirePageSession();
  requirePagePermission(session, "hq:view");
  const outlets = await listOutlets(await readyDb(), session.actor);
  const canManage = actorCan(session.actor, "hq:manage_outlets");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Headquarters / outlets"
        title="Every location, one rulebook."
        description="Outlet codes prefix order numbers. Tax and service charges are applied by the same pricing engine on the POS, storefront, and HQ."
      />

      <div className={`grid gap-6 ${canManage ? "xl:grid-cols-[1.45fr_0.55fr]" : ""}`}>
        <section className="h-card overflow-hidden" aria-labelledby="outlet-list">
          <div className="flex items-center justify-between gap-4 border-b border-ink/20 px-4 py-3">
            <div>
              <p className="h-label">Tenant scope</p>
              <h2 id="outlet-list" className="mt-0.5 text-lg font-extrabold">
                {outlets.length} outlet{outlets.length === 1 ? "" : "s"}
              </h2>
            </div>
            <span className="h-badge">{session.actor.tenantName}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="h-table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Outlet</th>
                  <th scope="col">Timezone</th>
                  <th scope="col">Tax</th>
                  <th scope="col">Service</th>
                  <th scope="col">Created</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {outlets.map((outlet) => (
                  <tr key={outlet.id}>
                    <td className="h-mono font-extrabold">{outlet.code}</td>
                    <td className="font-bold">{outlet.name}</td>
                    <td className="text-[11px] text-muted">{outlet.timezone}</td>
                    <td className="h-mono">{formatBps(outlet.taxBps)}</td>
                    <td className="h-mono">{formatBps(outlet.serviceChargeBps)}</td>
                    <td className="text-[11px] text-muted">{formatDateTime(outlet.createdAt)}</td>
                    <td><StatusBadge status={outlet.active ? "active" : "inactive"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {canManage ? <NewOutletForm /> : null}
      </div>

      {!canManage ? (
        <p className="mt-4 text-[11px] font-semibold text-muted">
          Your role can view outlets but not create them. Owner and organisation administrators can
          manage outlet settings.
        </p>
      ) : null}
    </div>
  );
}

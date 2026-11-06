import { requirePagePermission, requirePageSession } from "@/lib/auth";
import { readyDb } from "@/lib/server";
import { listStaff } from "@/modules/hq/hq-service";
import { EmptyState, PageHeader, RoleLabel, StatusBadge } from "@/components/ui";
import { titleCase } from "@/lib/format";

export const metadata = { title: "Staff & access" };
export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await requirePageSession();
  requirePagePermission(session, "hq:view_staff");
  const staff = await listStaff(await readyDb(), session.actor);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Headquarters / staff"
        title="Access follows the role."
        description="Membership and outlet grants are stored in the database. The server checks them on every request; hiding a button is never the control."
      />

      <div className="mb-5 grid grid-cols-2 border-y border-ink/20 sm:grid-cols-3">
        <div className="h-stat">
          <p className="h-label">Memberships</p>
          <p className="h-num mt-1 text-xl font-extrabold">{staff.length}</p>
        </div>
        <div className="h-stat border-l border-ink/20">
          <p className="h-label">Active</p>
          <p className="h-num mt-1 text-xl font-extrabold">{staff.filter((member) => member.active).length}</p>
        </div>
        <div className="h-stat col-span-2 border-t border-ink/20 sm:col-span-1 sm:border-l sm:border-t-0">
          <p className="h-label">Defined roles</p>
          <p className="h-num mt-1 text-xl font-extrabold">7</p>
        </div>
      </div>

      <section className="overflow-hidden border-t border-ink/20" aria-labelledby="staff-list">
        <div className="flex items-center justify-between gap-4 border-b border-ink/20 py-3">
          <div>
            <p className="h-label">Tenant access</p>
            <h2 id="staff-list" className="mt-0.5 text-lg font-extrabold">
              Staff directory
            </h2>
          </div>
          <span className="h-badge">Audited</span>
        </div>

        {staff.length === 0 ? (
          <EmptyState
            title="No memberships found"
            body="Staff accounts appear here once they are added to this tenant."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="h-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Outlet access</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.userId}>
                    <td className="font-extrabold">{member.displayName}</td>
                    <td className="h-mono text-[11px] text-muted">{member.email}</td>
                    <td><RoleLabel role={member.role} /></td>
                    <td className="text-[12px] font-semibold">
                      {member.outletCount === -1
                        ? "All tenant outlets"
                        : `${member.outletCount} granted outlet${member.outletCount === 1 ? "" : "s"}`}
                    </td>
                    <td><StatusBadge status={member.active ? "active" : "inactive"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside className="mt-7 border-t border-ink/20 pt-5">
        <p className="h-label">Access model</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {[
            { role: "Owner", body: "Business superuser across every outlet. The only role with refund permission." },
            { role: "Org admin", body: "Manages outlets and catalog across the tenant, without finance or refund access." },
            { role: "Outlet roles", body: "Manager, cashier, kitchen, and bar access is limited to explicitly granted outlets." },
          ].map((item) => (
            <div key={item.role}>
              <p className="text-[13px] font-extrabold">{titleCase(item.role)}</p>
              <p className="mt-1 text-[11px] font-semibold leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-ink/20 pt-3 text-[11px] font-semibold text-muted">
          This release lists existing memberships. Creating staff accounts, changing roles, and
          revoking individual outlet grants are not yet exposed in the UI; they require a
          database-side operator action.
        </p>
      </aside>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, ChefHat, Storefront } from "@phosphor-icons/react/dist/ssr";
import { requirePagePermission, requirePageSession } from "@/lib/auth";
import { readyDb } from "@/lib/server";
import { getHqOverview } from "@/modules/hq/hq-service";
import { actorCan } from "@/modules/identity/rbac";
import { PageHeader, StatCard, StatusBadge, EmptyState } from "@/components/ui";
import { formatDay, formatTime, titleCase } from "@/lib/format";
import { formatMoney } from "@/modules/shared/money";
import { isDemoMode } from "@/lib/env";
import { DemoBadge } from "@/components/brand";

export const metadata = { title: "HQ overview" };
export const dynamic = "force-dynamic";

export default async function HqOverviewPage() {
  const session = await requirePageSession();
  requirePagePermission(session, "hq:view");
  const overview = await getHqOverview(await readyDb(), session.actor);
  const maxSales = Math.max(...overview.series.map((point) => point.salesMinor), 1);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={`${session.actor.tenantName} / ${session.actor.outletName}`}
        title="The floor, in one glance."
        description="Live operational data from the same database that serves the POS, kitchen, and storefront. Figures cover the last 24 hours and are based on device transaction time."
        actions={
          <>
            {isDemoMode() ? <DemoBadge /> : null}
            {actorCan(session.actor, "pos:operate") ? (
              <Link href="/pos" className="h-btn h-btn-primary">
                <Storefront size={17} aria-hidden="true" />
                Open POS
              </Link>
            ) : null}
            {actorCan(session.actor, "kds:view") ? (
              <Link href="/kds" className="h-btn">
                <ChefHat size={17} aria-hidden="true" />
                Kitchen display
              </Link>
            ) : null}
          </>
        }
      />

      <section aria-label="Key figures" className="grid grid-cols-2 border-y border-ink/20 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Paid sales / 24h"
          value={formatMoney(overview.kpis.sales24hMinor)}
          hint="Captured cash only"
          tone="orange"
        />
        <StatCard
          label="Orders / 24h"
          value={String(overview.kpis.orders24h)}
          hint="All order states"
        />
        <StatCard
          label="Average order"
          value={formatMoney(overview.kpis.averageOrder24hMinor)}
          hint="Paid sales ÷ orders"
          tone="blue"
        />
        <StatCard
          label="Active outlets"
          value={String(overview.kpis.activeOutlets)}
          hint="Within your access"
        />
        <StatCard
          label="Open tickets"
          value={String(overview.kpis.openTickets)}
          hint="Kitchen + bar queues"
          tone={overview.kpis.openTickets > 0 ? "ink" : "paper"}
        />
      </section>

      <div className="mt-7 grid gap-8 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="overflow-hidden border-t border-ink/20" aria-labelledby="sales-trend">
          <div className="flex items-center justify-between gap-4 border-b border-ink/20 py-4">
            <div>
              <p className="h-label">Last 7 days</p>
              <h2 id="sales-trend" className="mt-0.5 text-lg font-extrabold">
                Paid sales trend
              </h2>
            </div>
            <span className="h-badge">IDR</span>
          </div>

          {overview.series.length === 0 ? (
            <EmptyState
              title="No sales recorded yet"
              body="Ring the first cash sale in the POS terminal and the trend will appear here."
              action={
                actorCan(session.actor, "pos:operate") ? (
                  <Link href="/pos" className="h-btn h-btn-sm h-btn-primary">
                    Open POS
                  </Link>
                ) : null
              }
            />
          ) : (
            <div className="px-5 pb-5 pt-4">
              <div className="flex h-48 items-end gap-2 border-b border-ink/40 pb-0">
                {overview.series.map((point) => {
                  const height = Math.max(2, Math.round((point.salesMinor / maxSales) * 100));
                  return (
                    <div key={point.day} className="group flex h-full min-w-0 flex-1 flex-col justify-end">
                      <p className="mb-1 truncate text-center text-[9px] font-extrabold tabular-nums text-muted opacity-0 transition-opacity group-hover:opacity-100">
                        {formatMoney(point.salesMinor)}
                      </p>
                      <div
                        className="w-full bg-brand-orange transition-colors group-hover:bg-brand-blue"
                        style={{ height: `${height}%` }}
                        title={`${point.day}: ${formatMoney(point.salesMinor)} across ${point.orders} orders`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2">
                {overview.series.map((point) => (
                  <p key={point.day} className="min-w-0 flex-1 truncate text-center text-[9px] font-bold text-muted">
                    {formatDay(point.day)}
                  </p>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-4 border-t border-ink/20 pt-3 text-[11px] font-bold text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 border border-ink bg-brand-orange" aria-hidden="true" />
                  Paid sales
                </span>
                <span>Device time · Asia/Jakarta labels</span>
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col border-l-2 border-brand-orange pl-5" aria-labelledby="hq-links">
          <p className="h-label">Control room</p>
          <h2 id="hq-links" className="h-title mt-2 text-[26px]">
            Keep the group consistent.
          </h2>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            Catalog, outlet, and staff changes are tenant-scoped, permission-checked, and recorded.
          </p>

          <div className="mt-5">
            {[
              { href: "/hq/outlets", label: "Outlets & pricing", meta: "Tax + service" },
              { href: "/hq/catalog", label: "Catalog", meta: "Products + stations" },
              ...(actorCan(session.actor, "hq:view_staff")
                ? [{ href: "/hq/staff", label: "Staff & access", meta: "Roles + grants" }]
                : []),
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between gap-3 border-t border-ink/20 py-3 text-ink transition-colors hover:text-brand-blue"
              >
                <span className="text-[13px] font-extrabold">{item.label}</span>
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-muted">
                  {item.meta}
                  <ArrowRight size={14} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-auto pt-5">
            <p className="border-t border-ink/20 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Signed in as {session.actor.displayName} · {titleCase(session.actor.role)}
            </p>
          </div>
        </section>
      </div>

      <section className="mt-6" aria-labelledby="recent-orders">
        <div className="h-card overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b-2 border-ink px-5 py-4">
            <div>
              <p className="h-label">Latest activity</p>
              <h2 id="recent-orders" className="mt-0.5 text-lg font-extrabold">
                Recent orders
              </h2>
            </div>
            <Link href="/pos" className="text-[11px] font-extrabold text-brand-blue underline">
              New order
            </Link>
          </div>

          {overview.recentOrders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              body="Orders from the POS, kitchen, and storefront will appear here with their payment state."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="h-table">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Outlet</th>
                    <th scope="col">Type</th>
                    <th scope="col">Time</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Fulfilment</th>
                    <th scope="col" className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="font-extrabold">{order.orderNumber}</td>
                      <td className="text-muted">{order.outletName}</td>
                      <td>{titleCase(order.orderType)}</td>
                      <td className="h-mono text-[11px] text-muted">{formatTime(order.occurredAt)}</td>
                      <td><StatusBadge status={order.paymentStatus} /></td>
                      <td><StatusBadge status={order.status} /></td>
                      <td className="h-num text-right font-extrabold">{formatMoney(order.totalMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

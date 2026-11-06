import Link from "next/link";
import { Wordmark, DemoBadge } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { RoleLabel } from "@/components/ui";
import { isDemoMode } from "@/lib/env";
import { actorCan, type Actor } from "@/modules/identity/rbac";

export function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const items: NavItem[] = [];
  if (actorCan(actor, "hq:view")) {
    items.push({ href: "/hq", label: "Overview", icon: "overview", exact: true });
    items.push({ href: "/hq/outlets", label: "Outlets", icon: "outlets" });
    items.push({ href: "/hq/catalog", label: "Catalog", icon: "catalog" });
  }
  if (actorCan(actor, "hq:view_staff")) {
    items.push({ href: "/hq/staff", label: "Staff & access", icon: "staff" });
  }
  if (actorCan(actor, "pos:operate")) {
    items.push({ href: "/pos", label: "POS terminal", icon: "pos" });
  }
  if (actorCan(actor, "kds:view")) {
    items.push({ href: "/kds", label: "Kitchen display", icon: "kds" });
  }

  return (
    <div className="min-h-dvh bg-ivory lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="border-b border-ink/20 bg-white px-3 py-3 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r lg:px-4 lg:py-5">
        <div className="mb-3 flex items-center justify-between gap-3 lg:mb-5">
          <Link href="/hq" aria-label="HANSAN home">
            <Wordmark />
          </Link>
          {isDemoMode() ? <DemoBadge /> : null}
        </div>

        <div className="mb-4 hidden border-y border-ink/15 py-3 lg:block">
          <p className="h-label">Signed in</p>
          <p className="mt-1 truncate text-[13px] font-extrabold">{actor.displayName}</p>
          <p className="truncate text-[10px] font-semibold text-muted">{actor.tenantName}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <RoleLabel role={actor.role} />
            <span className="h-badge">{actor.outletName}</span>
          </div>
        </div>

        <NavLinks items={items} />

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-ink/15 pt-3 lg:hidden">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-extrabold">{actor.displayName}</p>
            <p className="truncate text-[10px] font-semibold text-muted">
              {actor.role.replaceAll("_", " ")} · {actor.outletName}
            </p>
          </div>
          <LogoutButton compact />
        </div>

        <div className="mt-auto hidden lg:block">
          <div className="mb-3 border-t border-ink/15 pt-3">
            <p className="h-label">Session</p>
            <p className="mt-1 text-[11px] font-semibold text-muted">
              Server-verified · 8 hour shift
            </p>
          </div>
          <Link href="/" className="mb-1 flex min-h-9 items-center text-[12px] font-bold text-muted hover:text-ink">
            Public site / storefront
          </Link>
          <LogoutButton />
        </div>
      </aside>

      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-9 lg:py-8">{children}</main>
    </div>
  );
}

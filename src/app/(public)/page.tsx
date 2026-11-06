import Link from "next/link";
import {
  ArrowRight,
  ChefHat,
  CheckCircle,
  CloudArrowUp,
  Cube,
  LockKey,
  Monitor,
  Receipt,
  Storefront,
  WifiSlash,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import { DemoBadge } from "@/components/brand";
import { isDemoMode } from "@/lib/env";

const modules = [
  {
    number: "01",
    name: "POS",
    detail: "Offline cash queue",
    meta: "Durable",
    icon: Monitor,
  },
  {
    number: "02",
    name: "Kitchen",
    detail: "Station tickets",
    meta: "Live",
    icon: ChefHat,
  },
  {
    number: "03",
    name: "HQ",
    detail: "Multi-outlet control",
    meta: "Scoped",
    icon: Cube,
  },
  {
    number: "04",
    name: "Web",
    detail: "Pickup orders",
    meta: "Unpaid",
    icon: Storefront,
  },
];

export default function LandingPage() {
  return (
    <main>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <div className="h-rise">
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="h-badge h-badge-orange">F&amp;B operating system</span>
              {isDemoMode() ? <DemoBadge /> : null}
              <span className="h-badge">V4.1 vertical slice</span>
            </div>

            <h1 className="h-display text-[52px] sm:text-[74px] lg:text-[88px]">
              Every seat.
              <br />
              Every station.
              <br />
              <span>Even offline.</span>
            </h1>

            <p className="mt-7 max-w-xl text-[16px] font-medium leading-relaxed text-ink-soft">
              HANSAN runs the service floor from one spine: a durable offline POS, kitchen
              tickets, headquarters controls, and a public storefront that all use the same pricing,
              tax, and order rules.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={isDemoMode() ? "/store/demo" : "/login"} className="h-btn h-btn-primary">
                {isDemoMode() ? "Order from the demo store" : "Open staff sign in"}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/login" className="h-btn">
                Enter the operations deck
              </Link>
            </div>

            <dl className="mt-10 grid max-w-xl grid-cols-2 gap-x-6 gap-y-5 border-t-2 border-ink pt-6 sm:grid-cols-4">
              {[
                ["Offline-first", "POS queue"],
                ["PostgreSQL", "Authoritative"],
                ["RBAC", "Server-side"],
                ["One engine", "POS + web"],
              ].map(([term, detail]) => (
                <div key={term}>
                  <dt className="text-[13px] font-extrabold">{term}</dt>
                  <dd className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="h-rise lg:mt-4" style={{ animationDelay: "120ms" }}>
            <div className="border-t border-ink/20 py-4 sm:py-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="h-eyebrow text-muted">Shift control / live slice</p>
                <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase text-muted">
                  <span className="h-dot" aria-hidden="true" />
                  Available
                </span>
              </div>

              <div className="divide-y divide-ink/15 border-y border-ink/20">
                {modules.map((module) => {
                  const Icon = module.icon;
                  return (
                    <div
                      key={module.number}
                      className="flex items-center gap-3 py-3 text-ink"
                    >
                      <span className="h-mono w-7 flex-none text-[10px] font-bold text-muted">
                        {module.number}
                      </span>
                      <Icon size={18} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-extrabold leading-tight">{module.name}</p>
                        <p className="text-[11px] font-semibold text-muted">{module.detail}</p>
                      </div>
                      <span className="h-label">{module.meta}</span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 border-l-2 border-brand-orange pl-3 text-ink">
                <p className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.08em]">
                  <WifiSlash size={15} aria-hidden="true" />
                  Offline cash path
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Save to IndexedDB → queue with a stable UUID → retry idempotently → reconcile
                  server-side prices before an order is accepted.
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 divide-x divide-ink/20 border-y border-ink/20 text-center">
              {[
                ["17", "tables"],
                ["2", "stations"],
                ["8h", "sessions"],
              ].map(([value, label]) => (
                <div key={label} className="py-3">
                  <p className="h-num text-lg font-extrabold">{value}</p>
                  <p className="h-label mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="border-y-2 border-ink bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid gap-6 border-b-2 border-ink pb-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="h-label mb-2">One spine, four surfaces</p>
              <h2 className="h-title max-w-lg text-[36px] sm:text-[46px]">
                Built for the rush, not the slideshow.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-muted lg:justify-self-end">
              Each surface has one job. The rules underneath do not fork: the same catalog,
              pricing, tax, order state machine, and tenant boundary apply whether an order starts
              at the counter, the kitchen, or a customer&apos;s phone.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                number: "01",
                title: "POS that survives the internet",
                body: "Catalog and open orders live in IndexedDB. A dropped connection never blocks a cash sale.",
                icon: WifiSlash,
              },
              {
                number: "02",
                title: "Kitchen tickets, not order soup",
                body: "Kitchen and bar tickets move independently. An order completes only when every station is done.",
                icon: ChefHat,
              },
              {
                number: "03",
                title: "HQ with real boundaries",
                body: "Owners see the group. Managers see granted outlets. Every mutation is permission-checked and audited.",
                icon: LockKey,
              },
              {
                number: "04",
                title: "A storefront on the same rules",
                body: "Public orders are priced on the server, unpaid by default, and labelled pay-at-counter.",
                icon: Receipt,
              },
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.number}
                  className="border-t border-ink/20 py-5"
                >
                  <div className="flex items-start justify-between">
                    <Icon size={23} aria-hidden="true" />
                    <span className="h-mono text-[10px] font-bold text-muted">{feature.number}</span>
                  </div>
                  <h3 className="mt-5 text-[15px] font-extrabold leading-tight">{feature.title}</h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">
                    {feature.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="release" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="h-label mb-2">Release notes</p>
            <h2 className="h-title text-[34px] sm:text-[42px]">What is real in this build.</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
              A vertical slice is only useful if it is honest. This is the verified scope of the
              current release, including what is deliberately not here yet.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle size={21} weight="fill" className="text-brand-green" aria-hidden="true" />
                <h3 className="text-sm font-extrabold uppercase tracking-wide">Implemented</h3>
              </div>
              <ul className="space-y-2 text-[12px] font-semibold text-ink-soft">
                {[
                  "Offline cash POS with durable local queue",
                  "Idempotent sync and explicit price-change conflicts",
                  "Kitchen/bar tickets with independent state",
                  "HQ overview, outlets, catalog, staff access",
                  "Public pickup/dine-in ordering",
                  "Tenant isolation, RBAC, CSRF, audit logs",
                  "PGlite local engine and PostgreSQL production path",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 flex-none bg-brand-green" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="h-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <XCircle size={21} weight="fill" className="text-brand-red" aria-hidden="true" />
                <h3 className="text-sm font-extrabold uppercase tracking-wide">Not yet</h3>
              </div>
              <ul className="space-y-2 text-[12px] font-semibold text-muted">
                {[
                  "Card, QRIS, and EDC payment capture",
                  "Customer accounts, loyalty, and promotions",
                  "Inventory, procurement, and recipe costing",
                  "Payroll and workforce scheduling",
                  "Email/SMS notifications and receipts",
                  "Multi-currency pricing",
                  "Native mobile apps",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 flex-none bg-brand-red" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t-2 border-ink pt-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <CloudArrowUp size={26} weight="bold" aria-hidden="true" />
            <p className="max-w-md text-xs font-semibold leading-relaxed text-muted">
              Local development runs the real PostgreSQL engine in WebAssembly. Production uses a
              standard PostgreSQL server; the deployment guide is in the repository.
            </p>
          </div>
          <Link href="/login" className="h-btn h-btn-primary">
            Open the operations deck
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}

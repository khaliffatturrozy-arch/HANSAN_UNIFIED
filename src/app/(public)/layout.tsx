import Link from "next/link";
import { ArrowRight, Storefront } from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "@/components/brand";
import { isDemoMode } from "@/lib/env";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-ivory">
      <header className="border-b-2 border-ink bg-ivory">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="HANSAN public site">
            <Wordmark />
          </Link>
          <nav aria-label="Public" className="flex items-center gap-1 sm:gap-3">
            <Link href="/#platform" className="hidden px-2 py-2 text-xs font-extrabold sm:block">
              Platform
            </Link>
            <Link href="/#release" className="hidden px-2 py-2 text-xs font-extrabold sm:block">
              Release notes
            </Link>
            {isDemoMode() ? (
              <Link href="/store/demo" className="h-btn h-btn-sm h-btn-primary">
                <Storefront size={17} aria-hidden="true" />
                Demo store
              </Link>
            ) : null}
            <Link href="/login" className="h-btn h-btn-sm">
              Staff sign in
            </Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t-2 border-ink bg-paper">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
              An integrated F&amp;B operating platform. POS, kitchen, headquarters, and online
              ordering on one set of business rules.
            </p>
          </div>
          <div className="text-xs font-semibold text-muted">
            <p className="h-label mb-2">This environment</p>
            <p>{isDemoMode() ? "Demo data · not a production tenant" : "Configured deployment"}</p>
            <p className="mt-1">V4.1 vertical slice · cash-first payments</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

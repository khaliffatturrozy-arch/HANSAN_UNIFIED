import { redirect } from "next/navigation";
import Link from "next/link";
import { getPageSession } from "@/lib/auth";
import { homeForRole } from "@/modules/identity/rbac";
import { LoginForm } from "./login-form";

export const metadata = { title: "Staff sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getPageSession();
  if (session) redirect(homeForRole(session.actor.role));

  return (
    <main className="min-h-dvh bg-ivory">
      <section className="mx-auto flex min-h-dvh max-w-[1120px] flex-col px-5 py-5 sm:px-8 lg:px-12">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-extrabold tracking-wide">
            <span
              className="grid h-9 w-9 place-items-center bg-brand-orange text-[18px] font-black text-ink"
              aria-hidden="true"
            >
              H
            </span>
            HANSAN
          </Link>
        </div>

        <div className="my-auto grid w-full flex-1 items-center py-14 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:gap-16">
          <div className="hidden max-w-xl lg:block">
            <p className="h-eyebrow text-muted">HANSAN / Staff access</p>
            <h1 className="h-display mt-5 text-[56px] xl:text-[68px]">Your shift, in sync.</h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
              Sign in with the account issued by your organization. Your access is assigned
              securely and verified on every request.
            </p>
          </div>

          <div className="w-full max-w-[440px] lg:justify-self-end">
            <p className="h-label mb-2">Staff access</p>
            <h2 className="h-title text-[34px] sm:text-[38px]">Sign in to your shift.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Use the account issued to you by your organization. Sessions last eight hours and are
              revoked on sign-out.
            </p>

            <div className="mt-7 border-y border-ink/20 py-6">
              <LoginForm />
            </div>

            <p className="mt-5 text-[11px] font-semibold leading-relaxed text-muted">
              Need access? Contact your organization administrator.
            </p>
          </div>
        </div>

        <footer className="border-t border-ink/15 pt-4 text-[10px] font-semibold text-muted">
          Access and permissions are managed by your organization.
        </footer>
      </section>
    </main>
  );
}

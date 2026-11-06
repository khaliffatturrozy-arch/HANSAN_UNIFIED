import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-ink/25 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        <p className="h-label mb-2">{eyebrow}</p>
        <h1 className="h-title text-[34px] sm:text-[42px]">{title}</h1>
        {description ? <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "paper",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "paper" | "orange" | "blue" | "ink";
}) {
  const valueClass = tone === "orange" ? "text-brand-orange" : "";

  return (
    <div className="h-stat">
      <p className="h-label">{label}</p>
      <p className={`h-num mt-2 text-[26px] font-extrabold leading-none sm:text-[30px] ${valueClass}`}>{value}</p>
      {hint ? <p className="mt-1.5 text-[11px] font-semibold text-muted">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center px-6 py-16 text-center">
      <div className="mb-4 border-b border-ink/20 pb-3 text-3xl font-bold tabular-nums text-muted">0</div>
      <h3 className="text-lg font-extrabold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "h-badge-green",
    unpaid: "h-badge-orange",
    refunded: "h-badge-red",
    placed: "h-badge-blue",
    completed: "h-badge-green",
    cancelled: "h-badge-red",
    active: "h-badge-green",
    inactive: "h-badge-red",
    queued: "h-badge-orange",
    accepted: "h-badge-blue",
    preparing: "h-badge-blue",
    ready: "h-badge-green",
  };
  return <span className={`h-badge ${map[status] ?? ""}`}>{status}</span>;
}

export function RoleLabel({ role }: { role: string }) {
  return <span className="h-badge h-badge-ink">{role.replaceAll("_", " ")}</span>;
}

export function Wordmark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid h-9 w-9 place-items-center bg-brand-orange text-[18px] font-black leading-none text-ink"
      >
        H
      </span>
      <span
        className={`text-[18px] font-extrabold tracking-[-0.04em] ${inverse ? "text-ivory" : "text-ink"}`}
      >
        HANSAN
      </span>
    </span>
  );
}

export function DemoBadge() {
  return <span className="h-badge h-badge-blue">Demo data</span>;
}

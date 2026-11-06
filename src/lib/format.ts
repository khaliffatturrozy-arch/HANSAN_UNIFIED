const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
});

const dayFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  weekday: "short",
  day: "numeric",
});

export function formatDateTime(iso: string | Date): string {
  return dateTimeFormatter.format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatTime(iso: string | Date): string {
  return timeFormatter.format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatDay(iso: string): string {
  return dayFormatter.format(new Date(`${iso}T12:00:00Z`));
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

export function titleCase(value: string): string {
  return value
    .split(/[-\s]/)
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeMinutes(iso: string): string {
  const diffMinutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  return rtf.format(Math.round(diffMinutes / 60), "hour");
}

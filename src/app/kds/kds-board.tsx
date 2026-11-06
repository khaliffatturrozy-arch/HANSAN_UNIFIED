"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowClockwise,
  CheckCircle,
  ChefHat,
  ClockCountdown,
  Coffee,
  Monitor,
  SquaresFour,
  WarningCircle,
  WifiHigh,
  WifiSlash,
} from "@phosphor-icons/react";
import { LogoutButton } from "@/components/logout-button";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { titleCase } from "@/lib/format";

type TicketStatus = "queued" | "accepted" | "preparing" | "ready" | "completed";

interface Ticket {
  id: string;
  orderId: string;
  orderNumber: string;
  station: "kitchen" | "bar";
  status: TicketStatus;
  priority: number;
  orderType: string;
  tableLabel: string | null;
  customerName: string | null;
  occurredAt: string;
  createdAt: string;
  items: { id: string; name: string; quantity: number; note: string }[];
}

interface KdsActor {
  displayName: string;
  role: string;
  outletId: string;
  outletName: string;
  tenantName: string;
}

const NEXT: Record<string, { to: TicketStatus; label: string } | null> = {
  queued: { to: "accepted", label: "Accept" },
  accepted: { to: "preparing", label: "Start cooking" },
  preparing: { to: "ready", label: "Mark ready" },
  ready: { to: "completed", label: "Complete" },
  completed: null,
};

function elapsedLabel(iso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function urgency(iso: string, now: number): "fresh" | "watch" | "late" {
  const minutes = (now - new Date(iso).getTime()) / 60_000;
  if (minutes >= 15) return "late";
  if (minutes >= 8) return "watch";
  return "fresh";
}

function TicketCard({
  ticket,
  now,
  busy,
  onAdvance,
}: {
  ticket: Ticket;
  now: number;
  busy: boolean;
  onAdvance: (ticket: Ticket) => void;
}) {
  const next = NEXT[ticket.status];
  const level = urgency(ticket.occurredAt, now);
  const barColor = level === "late" ? "#B42318" : level === "watch" ? "#FF7A00" : "#0B6B3A";

  return (
    <article
      className="h-card overflow-hidden border-l-4 text-ink"
      style={{ borderLeftColor: barColor }}
      aria-label={`Ticket ${ticket.orderNumber}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-ink/15 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-black leading-tight">
            {ticket.orderNumber}
          </p>
          <p className="truncate text-[10px] font-bold uppercase tracking-wide text-muted">
            {titleCase(ticket.orderType)}
            {ticket.tableLabel ? ` · Table ${ticket.tableLabel}` : ""}
          </p>
        </div>
        <div className="flex flex-none items-center gap-1 border border-ink/20 px-2 py-0.5">
          <ClockCountdown size={12} weight="bold" aria-hidden="true" />
          <span className="h-mono text-[11px] font-extrabold">{elapsedLabel(ticket.occurredAt, now)}</span>
        </div>
      </div>

      <div className="px-3 py-3">
        <ul className="space-y-1.5">
          {ticket.items.map((item) => (
            <li key={item.id} className="flex gap-2 text-[13px] leading-tight">
              <span className="h-mono grid h-6 w-6 flex-none place-items-center border border-ink/20 bg-ivory text-[11px] font-black">
                {item.quantity}
              </span>
              <span className="pt-0.5 font-extrabold">
                {item.name}
                {item.note ? (
                  <span className="mt-1 block border-l border-ink/30 bg-ivory px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">
                    Note: {item.note}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink/15 pt-2">
          <span className="h-badge">{ticket.status}</span>
          {next ? (
            <button
              type="button"
              onClick={() => onAdvance(ticket)}
              disabled={busy}
              className={`h-btn h-btn-sm ${ticket.status === "ready" ? "h-btn-primary" : ""}`}
            >
              {ticket.status === "ready" ? <CheckCircle size={15} weight="bold" aria-hidden="true" /> : null}
              {busy ? "Saving…" : next.label}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Column({
  title,
  subtitle,
  tickets,
  now,
  busyId,
  onAdvance,
}: {
  title: string;
  subtitle: string;
  tickets: Ticket[];
  now: number;
  busyId: string | null;
  onAdvance: (ticket: Ticket) => void;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-ivory/25 pb-2">
        <h2 className="text-sm font-black uppercase tracking-[0.1em] text-ivory">{title}</h2>
        <span className="h-mono text-[10px] font-bold text-ivory/60">{subtitle}</span>
      </div>
      <div className="space-y-2.5">
        {tickets.length === 0 ? (
          <p className="border border-dashed border-ivory/20 px-3 py-8 text-center text-[11px] font-bold text-ivory/50">
            Nothing here.
          </p>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              now={now}
              busy={busyId === ticket.id}
              onAdvance={onAdvance}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function KdsBoard({
  actor,
  canViewHq,
  canOperatePos,
}: {
  actor: KdsActor;
  canViewHq: boolean;
  canOperatePos: boolean;
}) {
  const defaultStation: "kitchen" | "bar" =
    actor.role === "bar" ? "bar" : actor.role === "kitchen" ? "kitchen" : "kitchen";
  const [station, setStation] = useState<"kitchen" | "bar">(defaultStation);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      if (!quiet) setLoading(true);
      try {
        const data = await apiRequest<{ tickets: Ticket[] }>(
          `/api/kds/tickets?station=${station}&outletId=${encodeURIComponent(actor.outletId)}`,
          { signal: controller.signal },
        );
        setTickets(data.tickets);
        setError(null);
        setOnline(true);
        setLastUpdated(new Date());
      } catch (cause) {
        if (controller.signal.aborted) return;
        setOnline(false);
        setError(errorMessage(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [actor.outletId, station],
  );

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleOnline() {
      void load(true);
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [load]);

  async function advance(ticket: Ticket) {
    const next = NEXT[ticket.status];
    if (!next || busyId) return;
    setBusyId(ticket.id);
    setError(null);
    try {
      const data = await apiRequest<{ ticket: Ticket }>(
        `/api/kds/tickets/${ticket.id}/status`,
        { method: "POST", body: { to: next.to } },
      );
      setTickets((current) => {
        if (next.to === "completed") return current.filter((item) => item.id !== ticket.id);
        return current.map((item) => (item.id === ticket.id ? { ...item, ...data.ticket } : item));
      });
      setOnline(true);
      setLastUpdated(new Date());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  const grouped = useMemo(() => {
    return {
      incoming: tickets.filter((ticket) => ticket.status === "queued" || ticket.status === "accepted"),
      preparing: tickets.filter((ticket) => ticket.status === "preparing"),
      ready: tickets.filter((ticket) => ticket.status === "ready"),
    };
  }, [tickets]);

  const fixedStation = actor.role === "kitchen" || actor.role === "bar";
  const oldestTicket = tickets.reduce<Ticket | null>((oldest, ticket) => {
    if (!oldest || Date.parse(ticket.occurredAt) < Date.parse(oldest.occurredAt)) return ticket;
    return oldest;
  }, null);

  return (
    <div className="min-h-dvh bg-ink text-ivory">
      <header className="border-b border-ivory/25 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center bg-brand-orange text-[18px] font-black text-ink" aria-hidden="true">
              H
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.14em]">Kitchen display</p>
              <p className="text-[10px] font-bold text-ivory/60">
                {actor.tenantName} · {actor.outletName}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 border border-ivory/30 px-2 py-1 text-[10px] font-bold">
              {online ? <WifiHigh size={13} aria-hidden="true" /> : <WifiSlash size={13} aria-hidden="true" />}
              {online ? "Live · 10s refresh" : "Reconnecting"}
            </span>

            {!fixedStation ? (
              <div className="flex border border-ivory/30 p-0.5" role="group" aria-label="Station">
                <button
                  type="button"
                  onClick={() => setStation("kitchen")}
                  aria-pressed={station === "kitchen"}
                  className="inline-flex min-h-8 items-center gap-1 px-2.5 text-[10px] font-black uppercase"
                  style={{ background: station === "kitchen" ? "#FF7A00" : "transparent", color: station === "kitchen" ? "#121212" : "#FFF5D5" }}
                >
                  <ChefHat size={13} aria-hidden="true" /> Kitchen
                </button>
                <button
                  type="button"
                  onClick={() => setStation("bar")}
                  aria-pressed={station === "bar"}
                  className="inline-flex min-h-8 items-center gap-1 px-2.5 text-[10px] font-black uppercase"
                  style={{ background: station === "bar" ? "#FF7A00" : "transparent", color: station === "bar" ? "#121212" : "#FFF5D5" }}
                >
                  <Coffee size={13} aria-hidden="true" /> Bar
                </button>
              </div>
            ) : (
              <span className="h-badge h-badge-orange">{station} station</span>
            )}

            <button
              type="button"
              onClick={() => void load()}
              className="h-btn h-btn-sm h-btn-ghost text-ivory"
              style={{ borderColor: "rgba(255,245,213,.4)" }}
            >
              <ArrowClockwise size={15} aria-hidden="true" />
              Refresh
            </button>

            {canViewHq ? (
              <Link href="/hq" className="h-btn h-btn-sm h-btn-ghost text-ivory" style={{ borderColor: "rgba(255,245,213,.4)" }}>
                <SquaresFour size={15} aria-hidden="true" />
                HQ
              </Link>
            ) : null}
            {canOperatePos ? (
              <Link href="/pos" className="h-btn h-btn-sm h-btn-ghost text-ivory" style={{ borderColor: "rgba(255,245,213,.4)" }}>
                <Monitor size={15} aria-hidden="true" />
                POS
              </Link>
            ) : null}
            <div className="text-ivory">
              <LogoutButton compact />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6">
        <div className="mb-4 grid grid-cols-2 border-y border-ivory/20 sm:grid-cols-4">
          {[
            ["Open tickets", String(tickets.length)],
            ["Incoming", String(grouped.incoming.length)],
            ["On the pass", String(grouped.preparing.length)],
            ["Oldest wait", oldestTicket ? elapsedLabel(oldestTicket.occurredAt, now) : "—"],
          ].map(([label, value]) => (
            <div key={label} className="border-l border-ivory/20 px-3 py-2 first:border-l-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ivory/55">{label}</p>
              <p className="h-mono mt-1 text-[16px] font-bold">{value}</p>
            </div>
          ))}
          <p className="col-span-2 self-center text-[10px] font-bold text-ivory/55 sm:col-span-4 sm:mt-1 sm:text-right">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Loading…"}
          </p>
        </div>

        {error ? (
          <div className="mb-3 flex items-start gap-2 rounded-[10px] border-2 border-brand-red bg-brand-red/20 p-3 text-[12px] font-bold">
            <WarningCircle size={17} weight="fill" className="mt-0.5 flex-none" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading && tickets.length === 0 ? (
          <div className="grid place-items-center py-24 text-center">
            <span className="h-pulse text-sm font-black uppercase tracking-[0.2em]">Loading the pass…</span>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <Column
              title="Incoming"
              subtitle={`${grouped.incoming.length} tickets`}
              tickets={grouped.incoming}
              now={now}
              busyId={busyId}
              onAdvance={advance}
            />
            <Column
              title="On the pass"
              subtitle={`${grouped.preparing.length} tickets`}
              tickets={grouped.preparing}
              now={now}
              busyId={busyId}
              onAdvance={advance}
            />
            <Column
              title="Ready"
              subtitle={`${grouped.ready.length} tickets`}
              tickets={grouped.ready}
              now={now}
              busyId={busyId}
              onAdvance={advance}
            />
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  CloudArrowUp,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { formatMoney } from "@/modules/shared/money";
import { formatTime } from "@/lib/format";
import type { QueuedOrder } from "@/lib/pos/types";

const STATUS_CLASS: Record<string, string> = {
  pending: "h-badge h-badge-orange",
  syncing: "h-badge h-badge-blue",
  synced: "h-badge h-badge-green",
  conflict: "h-badge h-badge-red",
  failed: "h-badge h-badge-red",
};

function serverTotal(order: QueuedOrder): number | null {
  const value = order.error?.details?.serverTotalMinor;
  return typeof value === "number" ? value : null;
}

export function PosQueue({
  orders,
  online,
  authExpired,
  syncing,
  onClose,
  onSync,
  onDiscard,
}: {
  orders: QueuedOrder[];
  online: boolean;
  authExpired: boolean;
  syncing: boolean;
  onClose: () => void;
  onSync: () => void;
  onDiscard: (clientOrderId: string) => Promise<void>;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  const pending = orders.filter((order) => order.status === "pending" || order.status === "syncing");
  const conflicts = orders.filter((order) => order.status === "conflict");
  const failed = orders.filter((order) => order.status === "failed");
  const synced = orders.filter((order) => order.status === "synced").slice(-8).reverse();

  async function discard(id: string) {
    setDiscardingId(id);
    await onDiscard(id);
    setDiscardingId(null);
    setConfirmId(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="queue-title"
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col border border-ink/20 bg-white shadow-lg sm:max-h-[86dvh]"
        style={{ borderRadius: "14px 14px 0 0" }}
      >
        <header className="flex items-center justify-between gap-3 border-b-2 border-ink bg-paper px-4 py-3">
          <div>
            <p className="h-label">Device queue</p>
            <h2 id="queue-title" className="mt-0.5 text-lg font-extrabold">
              Sync ledger
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSync}
              disabled={syncing || !online}
              className="h-btn h-btn-sm h-btn-primary"
            >
              <ArrowClockwise size={15} className={syncing ? "h-pulse" : ""} aria-hidden="true" />
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            <button type="button" onClick={onClose} className="h-btn h-btn-sm h-btn-ghost" aria-label="Close queue">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex flex-wrap gap-2 border-b-2 border-ink px-4 py-2.5">
          <span className="h-badge h-badge-orange">{pending.length} waiting</span>
          <span className="h-badge h-badge-red">{conflicts.length} conflict</span>
          <span className="h-badge h-badge-red">{failed.length} rejected</span>
          <span className="h-badge h-badge-green">{synced.length} recent sync</span>
          <span className="h-badge">{online ? "Online" : "Offline"}</span>
        </div>

        {!online ? (
          <div className="flex items-start gap-2 border-b-2 border-ink bg-orange px-4 py-2.5 text-[11px] font-bold text-ink">
            <CloudArrowUp size={16} weight="bold" className="mt-0.5 flex-none" aria-hidden="true" />
            <span>
              This device is offline. Sales are safe in IndexedDB. Sync will retry automatically
              when the connection returns.
            </span>
          </div>
        ) : null}

        {authExpired ? (
          <div className="flex items-start gap-2 border-b-2 border-ink bg-red-100 px-4 py-2.5 text-[11px] font-bold text-brand-red">
            <WarningCircle size={16} weight="fill" className="mt-0.5 flex-none" aria-hidden="true" />
            <span>Your session expired. Sign in again before the queue can be confirmed by the server.</span>
          </div>
        ) : null}

        <div className="h-scroll flex-1 space-y-2 overflow-y-auto p-4">
          {orders.length === 0 ? (
            <div className="grid place-items-center py-16 text-center">
              <CheckCircle size={38} weight="light" aria-hidden="true" />
              <p className="mt-2 text-sm font-extrabold">The queue is empty.</p>
              <p className="mt-1 max-w-xs text-[11px] font-semibold text-muted">
                Every cash sale on this device has been confirmed by the server.
              </p>
            </div>
          ) : null}

          {[...orders].reverse().map((order) => {
            const server = serverTotal(order);
            const isConflict = order.status === "conflict";
            const canDiscard = isConflict || order.status === "failed";
            return (
              <article
                key={order.clientOrderId}
                className="border-b border-ink/15 bg-white py-3"
                style={{ borderRadius: 10 }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="h-mono text-[12px] font-extrabold">
                      {order.serverOrderNumber ?? order.localNumber}
                    </p>
                    <p className="text-[10px] font-semibold text-muted">
                      {formatTime(order.occurredAt)} · {order.orderType.replace("-", " ")}
                      {order.tableLabel ? ` · Table ${order.tableLabel}` : ""} ·{" "}
                      {order.lines.reduce((sum, line) => sum + line.quantity, 0)} items
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={STATUS_CLASS[order.status] ?? "h-badge"}>{order.status}</span>
                    <span className="h-num text-sm font-extrabold">{formatMoney(order.localTotalMinor)}</span>
                  </div>
                </div>

                {isConflict ? (
                  <div className="mt-2 rounded-[8px] border-2 border-brand-red bg-red-100 p-2 text-[11px] font-semibold text-brand-red">
                    <p className="font-extrabold">Not accepted: menu price changed.</p>
                    <p className="mt-0.5">
                      Device total {formatMoney(order.localTotalMinor)}
                      {server !== null ? ` · Server total ${formatMoney(server)}` : ""}. Resolve the
                      difference with the customer, then discard and re-ring the order.
                    </p>
                  </div>
                ) : null}

                {order.status === "failed" ? (
                  <div className="mt-2 rounded-[8px] border-2 border-brand-red bg-red-100 p-2 text-[11px] font-semibold text-brand-red">
                    <p className="font-extrabold">Rejected by server: {order.error?.code ?? "UNKNOWN"}</p>
                    <p className="mt-0.5">{order.error?.message ?? "The server did not accept this order."}</p>
                  </div>
                ) : null}

                {order.status === "pending" && order.error ? (
                  <p className="mt-1.5 text-[10px] font-semibold text-muted">
                    Last attempt: {order.error.message} ({order.attempts} attempt
                    {order.attempts === 1 ? "" : "s"})
                  </p>
                ) : null}

                {order.status === "synced" ? (
                  <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-brand-green">
                    <CheckCircle size={13} weight="fill" aria-hidden="true" />
                    Confirmed by server
                  </p>
                ) : null}

                {canDiscard ? (
                  <div className="mt-2 flex items-center justify-end gap-2 border-t border-ink/20 pt-2">
                    {confirmId === order.clientOrderId ? (
                      <>
                        <span className="mr-auto text-[10px] font-bold text-brand-red">
                          Discard the local record? This cannot be undone.
                        </span>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="h-btn h-btn-sm"
                          disabled={discardingId === order.clientOrderId}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void discard(order.clientOrderId)}
                          className="h-btn h-btn-sm h-btn-danger"
                          disabled={discardingId === order.clientOrderId}
                        >
                          <Trash size={13} aria-hidden="true" />
                          {discardingId === order.clientOrderId ? "Discarding…" : "Confirm discard"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(order.clientOrderId)}
                        className="h-btn h-btn-sm h-btn-danger"
                      >
                        <Trash size={13} aria-hidden="true" />
                        {isConflict ? "Discard / re-ring" : "Discard record"}
                      </button>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <footer className="border-t-2 border-ink bg-paper px-4 py-2 text-[10px] font-semibold text-muted">
          Confirmed orders stay on this device for 7 days. Conflicts and rejected rows are never
          auto-deleted.
        </footer>
      </section>
    </div>
  );
}

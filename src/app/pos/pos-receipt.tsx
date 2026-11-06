"use client";

import {
  CheckCircle,
  CloudArrowUp,
  Receipt,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { formatMoney } from "@/modules/shared/money";
import { formatDateTime } from "@/lib/format";
import type { QueuedOrder } from "@/lib/pos/types";

function statusCopy(order: QueuedOrder) {
  if (order.status === "synced") {
    return {
      tone: "green",
      title: "Confirmed by server",
      body: `Server order ${order.serverOrderNumber ?? ""} was accepted and paid in cash.`,
    };
  }
  if (order.status === "conflict") {
    return {
      tone: "red",
      title: "Not accepted: price changed",
      body:
        "The server rejected this order because menu prices changed while the device was offline. The cash recorded here is not confirmed revenue. Resolve the difference with the customer, then discard and re-ring.",
    };
  }
  if (order.status === "failed") {
    return {
      tone: "red",
      title: "Rejected by server",
      body: order.error?.message ?? "The server did not accept this order.",
    };
  }
  return {
    tone: "orange",
    title: "Saved on this device",
    body:
      "Cash is recorded locally. The order is queued with a stable ID and will be confirmed after the connection returns. Do not treat the local number as an official order number.",
  };
}

export function PosReceipt({
  order,
  onClose,
  onOpenQueue,
}: {
  order: QueuedOrder;
  onClose: () => void;
  onOpenQueue: () => void;
}) {
  const copy = statusCopy(order);
  const tone =
    copy.tone === "green"
      ? { background: "#DFF3E7", border: "#0B6B3A", text: "#0B6B3A" }
      : copy.tone === "red"
        ? { background: "#FFE4E1", border: "#B42318", text: "#B42318" }
        : { background: "#FFF5D5", border: "#FF7A00", text: "#121212" };
  const total = order.localTotalMinor;
  const change = order.payment.tenderedMinor - total;
  const subtotal = order.lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
        className="h-scroll max-h-[94dvh] w-full max-w-md overflow-y-auto border border-ink/20 bg-white shadow-lg"
        style={{ borderRadius: "14px 14px 0 0" }}
      >
        <header className="flex items-center justify-between border-b-2 border-ink px-4 py-3">
          <div className="flex items-center gap-2">
            <Receipt size={20} weight="bold" aria-hidden="true" />
            <h2 id="receipt-title" className="text-base font-extrabold">
              Cash receipt
            </h2>
          </div>
          <button type="button" onClick={onClose} className="h-btn h-btn-sm h-btn-ghost" aria-label="Close receipt" autoFocus>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="px-5 py-4">
          <div
            className="flex items-start gap-2 border-2 p-3 text-[11px] font-bold leading-relaxed"
            style={{ background: tone.background, borderColor: tone.border, color: tone.text, borderRadius: 10 }}
            role="status"
          >
            {copy.tone === "green" ? (
              <CheckCircle size={17} weight="fill" className="mt-0.5 flex-none" aria-hidden="true" />
            ) : copy.tone === "orange" ? (
              <CloudArrowUp size={17} weight="bold" className="mt-0.5 flex-none" aria-hidden="true" />
            ) : (
              <WarningCircle size={17} weight="fill" className="mt-0.5 flex-none" aria-hidden="true" />
            )}
            <span>
              <span className="block font-extrabold">{copy.title}</span>
              {copy.body}
            </span>
          </div>

          <div className="mt-5 text-center">
            <p className="h-label">HANSAN · cash sale</p>
            <p className="h-mono mt-1 text-2xl font-black">
              {order.serverOrderNumber ?? order.localNumber}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-muted">{formatDateTime(order.occurredAt)}</p>
            <p className="mt-1 text-[11px] font-semibold text-muted">
              {order.orderType.replace("-", " ")}
              {order.tableLabel ? ` · Table ${order.tableLabel}` : ""}
            </p>
          </div>

          <hr className="my-4 border-0 border-t-2 border-dashed border-ink/30" />

          <ul className="space-y-2">
            {order.lines.map((line) => (
              <li key={line.productId} className="flex items-start justify-between gap-3 text-[12px]">
                <span className="font-bold">
                  <span className="h-mono mr-1.5 font-extrabold">{line.quantity}×</span>
                  {line.name}
                  {line.note ? (
                    <span className="mt-0.5 block text-[10px] font-semibold text-muted">Note: {line.note}</span>
                  ) : null}
                </span>
                <span className="h-num flex-none font-extrabold">
                  {formatMoney(line.unitPriceMinor * line.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <hr className="my-4 border-0 border-t-2 border-dashed border-ink/30" />

          <dl className="space-y-1.5 text-[12px]">
            <div className="flex justify-between">
              <dt className="font-semibold text-muted">Subtotal</dt>
              <dd className="h-num font-bold">{formatMoney(subtotal)}</dd>
            </div>
            {order.discountMinor > 0 ? (
              <div className="flex justify-between">
                <dt className="font-semibold text-muted">Discount</dt>
                <dd className="h-num font-bold">−{formatMoney(order.discountMinor)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-base">
              <dt className="font-extrabold">Total</dt>
              <dd className="h-num font-black">{formatMoney(total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-semibold text-muted">Cash tendered</dt>
              <dd className="h-num font-bold">{formatMoney(order.payment.tenderedMinor)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-semibold text-muted">Change</dt>
              <dd className="h-num font-bold">{formatMoney(Math.max(0, change))}</dd>
            </div>
          </dl>

          {order.discountReason ? (
            <p className="mt-3 text-[10px] font-semibold text-muted">Discount reason: {order.discountReason}</p>
          ) : null}

          <div className="mt-5 grid gap-2">
            {order.status !== "synced" ? (
              <button type="button" onClick={onOpenQueue} className="h-btn w-full">
                Open sync queue
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="h-btn h-btn-primary w-full">
              Start next order
            </button>
          </div>

          <p className="mt-4 text-center text-[9px] font-semibold leading-relaxed text-muted">
            Local record · device clock {formatDateTime(order.occurredAt)}. Server confirmation is
            authoritative. Cash handling is completed outside this application.
          </p>
        </div>
      </section>
    </div>
  );
}

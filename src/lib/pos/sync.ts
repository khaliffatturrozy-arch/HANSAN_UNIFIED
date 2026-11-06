"use client";

import { ApiError, apiRequest } from "@/lib/client-api";
import { listOrders, setLastSyncAt, updateOrder } from "./storage";
import type { QueuedOrder } from "./types";

export interface SyncSummary {
  attempted: number;
  synced: number;
  conflicts: number;
  failed: number;
  networkError: boolean;
  authRequired: boolean;
}

interface ServerSyncResult {
  clientOrderId: string;
  ok: boolean;
  order?: {
    clientOrderId: string;
    orderId: string;
    orderNumber: string;
    totalMinor: number;
    changeMinor: number;
    duplicate: boolean;
  };
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

const EMPTY_SUMMARY: SyncSummary = {
  attempted: 0,
  synced: 0,
  conflicts: 0,
  failed: 0,
  networkError: false,
  authRequired: false,
};

function toSyncPayload(order: QueuedOrder) {
  return {
    clientOrderId: order.clientOrderId,
    orderType: order.orderType,
    ...(order.tableLabel ? { tableLabel: order.tableLabel } : {}),
    lines: order.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      note: line.note,
    })),
    discountMinor: order.discountMinor,
    ...(order.discountReason ? { discountReason: order.discountReason } : {}),
    expectedTotalMinor: order.expectedTotalMinor,
    catalogVersion: order.catalogVersion,
    occurredAt: order.occurredAt,
    payment: order.payment,
  };
}

/**
 * Push pending rows to the server. The client UUID is the idempotency key, so a
 * retry after an ambiguous network failure can only ever create one order.
 */
export async function syncQueuedOrders(): Promise<SyncSummary> {
  const all = await listOrders();
  const sendable = all.filter(
    (order) => order.status === "pending" || order.status === "syncing",
  );
  if (sendable.length === 0) return { ...EMPTY_SUMMARY };

  const summary: SyncSummary = { ...EMPTY_SUMMARY };
  const byOutlet = new Map<string, QueuedOrder[]>();
  for (const order of sendable) {
    const group = byOutlet.get(order.outletId) ?? [];
    group.push(order);
    byOutlet.set(order.outletId, group);
  }

  for (const [outletId, orders] of byOutlet) {
    const batches: QueuedOrder[][] = [];
    for (let index = 0; index < orders.length; index += 20) {
      batches.push(orders.slice(index, index + 20));
    }

    for (const batch of batches) {
      for (const order of batch) {
        await updateOrder(order.clientOrderId, { status: "syncing" });
      }
      summary.attempted += batch.length;

      let payload: { results: ServerSyncResult[] };
      try {
        payload = await apiRequest<{ results: ServerSyncResult[] }>("/api/pos/sync", {
          method: "POST",
          body: {
            outletId,
            orders: batch.map(toSyncPayload),
          },
        });
      } catch (error) {
        const isAuth = error instanceof ApiError && error.status === 401;
        const isForbidden = error instanceof ApiError && error.status === 403;
        if (isAuth || isForbidden) summary.authRequired = true;
        else summary.networkError = true;

        const code = error instanceof ApiError ? error.code : "NETWORK";
        const message =
          error instanceof ApiError ? error.message : "The device could not reach the server.";
        for (const order of batch) {
          await updateOrder(order.clientOrderId, {
            status: "pending",
            attempts: order.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
            error: { code, message },
          });
        }
        if (summary.authRequired) return summary;
        continue;
      }

      const byId = new Map(payload.results.map((result) => [result.clientOrderId, result]));
      for (const order of batch) {
        const result = byId.get(order.clientOrderId);
        const now = new Date().toISOString();
        if (!result || !result.ok || !result.order) {
          const error = result?.error ?? {
            code: "INTERNAL",
            message: "The server did not return a result for this transaction.",
          };
          if (error.code === "PRICE_CHANGED") {
            summary.conflicts += 1;
            await updateOrder(order.clientOrderId, {
              status: "conflict",
              attempts: order.attempts + 1,
              lastAttemptAt: now,
              error,
            });
          } else {
            summary.failed += 1;
            await updateOrder(order.clientOrderId, {
              status: "failed",
              attempts: order.attempts + 1,
              lastAttemptAt: now,
              error,
            });
          }
          continue;
        }

        summary.synced += 1;
        await updateOrder(order.clientOrderId, {
          status: "synced",
          attempts: order.attempts + 1,
          lastAttemptAt: now,
          serverOrderId: result.order.orderId,
          serverOrderNumber: result.order.orderNumber,
          error: undefined,
        });
      }
    }
  }

  await setLastSyncAt(new Date().toISOString());
  return summary;
}

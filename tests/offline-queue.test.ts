import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteOrder,
  enqueueOrder,
  listOrders,
  pruneSyncedOrders,
  updateOrder,
} from "@/lib/pos/storage";
import { syncQueuedOrders } from "@/lib/pos/sync";
import type { QueuedOrder } from "@/lib/pos/types";

const OUTLET_ID = "6f0c9f2c-4a6e-4f34-b47c-a456fa51f6a1";

function makeQueuedOrder(overrides: Partial<QueuedOrder> = {}): QueuedOrder {
  const now = new Date().toISOString();
  return {
    clientOrderId: crypto.randomUUID(),
    outletId: OUTLET_ID,
    orderType: "take-away",
    lines: [
      {
        productId: "1e9db13f-1d74-4a6f-a3fe-09f5d30f0a99",
        name: "Test item",
        unitPriceMinor: 22_000,
        quantity: 1,
        note: "",
      },
    ],
    discountMinor: 0,
    expectedTotalMinor: 25_520,
    catalogVersion: "abc123",
    occurredAt: now,
    payment: { method: "cash", tenderedMinor: 30_000 },
    localNumber: "LOCAL-1200-TEST",
    localTotalMinor: 25_520,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function clearQueue(): Promise<void> {
  const orders = await listOrders();
  await Promise.all(orders.map((order) => deleteOrder(order.clientOrderId)));
}

beforeEach(async () => {
  await clearQueue();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("durable POS queue", () => {
  it("stores and updates a queued sale by stable client order id", async () => {
    const order = makeQueuedOrder();
    await enqueueOrder(order);

    const listed = await listOrders();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      clientOrderId: order.clientOrderId,
      status: "pending",
      expectedTotalMinor: 25_520,
    });

    const updated = await updateOrder(order.clientOrderId, { status: "syncing", attempts: 1 });
    expect(updated?.status).toBe("syncing");
    expect(updated?.attempts).toBe(1);
  });

  it("prunes only old synced rows and never deletes unresolved sales", async () => {
    const stale = new Date(Date.now() - 8 * 24 * 60 * 60_000).toISOString();
    const syncedOld = makeQueuedOrder({ status: "synced", createdAt: stale, updatedAt: stale });
    const pendingOld = makeQueuedOrder({ status: "pending", createdAt: stale, updatedAt: stale });
    const conflictOld = makeQueuedOrder({ status: "conflict", createdAt: stale, updatedAt: stale });
    await enqueueOrder(syncedOld);
    await enqueueOrder(pendingOld);
    await enqueueOrder(conflictOld);

    const deleted = await pruneSyncedOrders(7 * 24 * 60 * 60_000);
    expect(deleted).toBe(1);

    const remaining = await listOrders();
    expect(remaining.map((order) => order.clientOrderId).sort()).toEqual(
      [pendingOld.clientOrderId, conflictOld.clientOrderId].sort(),
    );
  });
});

describe("queue sync", () => {
  it("marks accepted rows synced and retains a price conflict with its server details", async () => {
    const accepted = makeQueuedOrder();
    const conflict = makeQueuedOrder({ expectedTotalMinor: 20_000 });
    await enqueueOrder(accepted);
    await enqueueOrder(conflict);

    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({
        ok: true,
        data: {
          results: [
            {
              clientOrderId: accepted.clientOrderId,
              ok: true,
              order: {
                clientOrderId: accepted.clientOrderId,
                orderId: "8a1b3443-58e0-429f-aa56-e9ecfea88dcb",
                orderNumber: "MAIN-0042",
                totalMinor: 25_520,
                changeMinor: 4_480,
                duplicate: false,
              },
            },
            {
              clientOrderId: conflict.clientOrderId,
              ok: false,
              error: {
                code: "PRICE_CHANGED",
                message: "Prices changed while this order was offline",
                details: { serverTotalMinor: 27_150 },
              },
            },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const summary = await syncQueuedOrders();
    expect(summary).toMatchObject({
      attempted: 2,
      synced: 1,
      conflicts: 1,
      failed: 0,
      networkError: false,
      authRequired: false,
    });

    const rows = await listOrders();
    const synced = rows.find((order) => order.clientOrderId === accepted.clientOrderId);
    const conflicted = rows.find((order) => order.clientOrderId === conflict.clientOrderId);
    expect(synced).toMatchObject({
      status: "synced",
      serverOrderId: "8a1b3443-58e0-429f-aa56-e9ecfea88dcb",
      serverOrderNumber: "MAIN-0042",
      attempts: 1,
    });
    expect(conflicted).toMatchObject({
      status: "conflict",
      attempts: 1,
      error: { code: "PRICE_CHANGED", details: { serverTotalMinor: 27_150 } },
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.outletId).toBe(OUTLET_ID);
    const acceptedPayload = requestBody.orders.find(
      (order: { clientOrderId: string }) => order.clientOrderId === accepted.clientOrderId,
    );
    expect(acceptedPayload).toMatchObject({
      clientOrderId: accepted.clientOrderId,
      expectedTotalMinor: 25_520,
      payment: { method: "cash", tenderedMinor: 30_000 },
    });
  });

  it("keeps the queue pending and reports auth failure without dropping rows", async () => {
    const order = makeQueuedOrder();
    await enqueueOrder(order);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in required" } },
          401,
        ),
      ),
    );

    const summary = await syncQueuedOrders();
    expect(summary).toMatchObject({ authRequired: true, networkError: false, synced: 0 });

    const [row] = await listOrders();
    expect(row).toMatchObject({
      status: "pending",
      attempts: 1,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(row?.clientOrderId).toBe(order.clientOrderId);
  });

  it("keeps the same idempotency key across a network failure and a later retry", async () => {
    const order = makeQueuedOrder();
    await enqueueOrder(order);

    const failingFetch = vi.fn(async () => {
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", failingFetch);

    const failed = await syncQueuedOrders();
    expect(failed).toMatchObject({ networkError: true, authRequired: false, synced: 0 });
    expect((await listOrders())[0]).toMatchObject({ status: "pending", attempts: 1 });

    const successFetch = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return jsonResponse({
        ok: true,
        data: {
          results: [
            {
              clientOrderId: body.orders[0].clientOrderId,
              ok: true,
              order: {
                clientOrderId: body.orders[0].clientOrderId,
                orderId: "c3d3c104-7c42-4f6a-bdd4-2a3b0a8c3b1e",
                orderNumber: "MAIN-0043",
                totalMinor: 25_520,
                changeMinor: 4_480,
                duplicate: true,
              },
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", successFetch);

    const retried = await syncQueuedOrders();
    expect(retried.synced).toBe(1);
    const retryBody = JSON.parse(String(successFetch.mock.calls[0]?.[1]?.body));
    expect(retryBody.orders[0].clientOrderId).toBe(order.clientOrderId);
    expect((await listOrders())[0]).toMatchObject({ status: "synced", attempts: 2 });
  });
});

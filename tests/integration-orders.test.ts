import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { TestDatabase } from "./helpers/db";
import { createTestDatabase } from "./helpers/db";
import { createTenantFixture, makeSyncOrder, type TenantFixture } from "./helpers/fixtures";
import {
  orderEvents,
  orderLines,
  orders,
  outletOrderCounters,
  outletProducts,
  payments,
  stationTicketItems,
  stationTickets,
} from "@/db/schema";
import { getPublicStorefront } from "@/modules/ordering/catalog";
import { syncPosOrders, createPublicOrder } from "@/modules/ordering/order-service";
import { listKdsTickets, transitionTicket } from "@/modules/kitchen/kds-service";
import { getHqOverview } from "@/modules/hq/hq-service";
import { AppError } from "@/modules/shared/errors";
import { calculateTotals } from "@/modules/shared/money";

let database: TestDatabase;
let first: TenantFixture;
let second: TenantFixture;
let mixedOrderClientId: string;

const PRICING = { taxBps: 1_100, serviceChargeBps: 500 };
const MIXED_SUBTOTAL = 22_000 + 45_000;
const MIXED_TOTALS = calculateTotals({ subtotalMinor: MIXED_SUBTOTAL, pricing: PRICING });

beforeAll(async () => {
  database = await createTestDatabase();
  first = await createTenantFixture(database.db, {
    slug: "ordering-test",
    name: "Ordering Test",
    firstOutletCode: "AAA",
    secondOutletCode: "ZZZ",
  });
  second = await createTenantFixture(database.db, {
    slug: "other-tenant",
    name: "Other Tenant",
    firstOutletCode: "B1",
    secondOutletCode: "B2",
  });
});

afterAll(async () => {
  await database.close();
});

describe("POS order sync", () => {
  it("re-prices server-side, splits station tickets, records cash, and is idempotent", async () => {
    mixedOrderClientId = crypto.randomUUID();
    const input = makeSyncOrder({
      productId: first.barProductId,
      priceMinor: 22_000,
      expectedTotalMinor: MIXED_TOTALS.totalMinor,
      clientOrderId: mixedOrderClientId,
      tenderedMinor: 100_000,
    });
    input.lines.push({
      productId: first.kitchenProductId,
      quantity: 1,
      note: "No chili",
    });

    const result = await syncPosOrders(database.db, first.actors.cashier.actor, {
      outletId: first.outlets[0].id,
      orders: [input],
    });

    expect(result.results[0]).toMatchObject({
      ok: true,
      order: {
        clientOrderId: mixedOrderClientId,
        paymentStatus: "paid",
        totalMinor: MIXED_TOTALS.totalMinor,
        changeMinor: 100_000 - MIXED_TOTALS.totalMinor,
        duplicate: false,
      },
    });

    const orderRows = await database.db
      .select()
      .from(orders)
      .where(eq(orders.clientOrderId, mixedOrderClientId));
    expect(orderRows).toHaveLength(1);
    const order = orderRows[0]!;
    expect(order.outletId).toBe(first.outlets[0].id);
    expect(order.status).toBe("placed");
    expect(order.subtotalMinor).toBe(MIXED_SUBTOTAL);
    expect(order.taxMinor).toBe(MIXED_TOTALS.taxMinor);
    expect(order.serviceChargeMinor).toBe(MIXED_TOTALS.serviceChargeMinor);

    const lines = await database.db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.station).sort()).toEqual(["bar", "kitchen"]);

    const tickets = await database.db
      .select()
      .from(stationTickets)
      .where(eq(stationTickets.orderId, order.id));
    expect(tickets).toHaveLength(2);
    expect(tickets.map((ticket) => ticket.station).sort()).toEqual(["bar", "kitchen"]);
    const ticketItems = await database.db
      .select()
      .from(stationTicketItems)
      .where(eq(stationTicketItems.ticketId, tickets[0]!.id));
    expect(ticketItems.length).toBeGreaterThan(0);

    const paymentRows = await database.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, order.id));
    expect(paymentRows).toHaveLength(1);
    expect(paymentRows[0]).toMatchObject({
      method: "cash",
      status: "captured",
      amountMinor: MIXED_TOTALS.totalMinor,
      tenderedMinor: 100_000,
      changeMinor: 22_280,
    });

    const duplicate = await syncPosOrders(database.db, first.actors.cashier.actor, {
      outletId: first.outlets[0].id,
      orders: [input],
    });
    expect(duplicate.results[0]).toMatchObject({
      ok: true,
      order: { orderId: order.id, duplicate: true, changeMinor: 22_280 },
    });

    const orderCount = await database.db
      .select()
      .from(orders)
      .where(eq(orders.clientOrderId, mixedOrderClientId));
    expect(orderCount).toHaveLength(1);
    const paymentCount = await database.db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(paymentCount).toHaveLength(1);
  });

  it("applies an authorized discount and its reason", async () => {
    const totals = calculateTotals({
      subtotalMinor: MIXED_SUBTOTAL,
      discountMinor: 7_000,
      pricing: PRICING,
    });
    const clientOrderId = crypto.randomUUID();
    const input = makeSyncOrder({
      productId: first.barProductId,
      priceMinor: 22_000,
      expectedTotalMinor: totals.totalMinor,
      clientOrderId,
      discountMinor: 7_000,
      discountReason: "Staff meal",
      tenderedMinor: totals.totalMinor,
    });
    input.lines.push({ productId: first.kitchenProductId, quantity: 1, note: "" });

    const result = await syncPosOrders(database.db, first.actors.cashier.actor, {
      outletId: first.outlets[0].id,
      orders: [input],
    });

    // Cashier does not hold pos:discount even though they can operate the POS.
    expect(result.results[0]).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("allows an owner to apply a discount with a reason", async () => {
    const totals = calculateTotals({
      subtotalMinor: MIXED_SUBTOTAL,
      discountMinor: 7_000,
      pricing: PRICING,
    });
    const clientOrderId = crypto.randomUUID();
    const input = makeSyncOrder({
      productId: first.barProductId,
      priceMinor: 22_000,
      expectedTotalMinor: totals.totalMinor,
      clientOrderId,
      discountMinor: 7_000,
      discountReason: "Staff meal",
      tenderedMinor: totals.totalMinor,
    });
    input.lines.push({ productId: first.kitchenProductId, quantity: 1, note: "" });

    const result = await syncPosOrders(database.db, first.actors.owner.actor, {
      outletId: first.outlets[0].id,
      orders: [input],
    });

    expect(result.results[0]).toMatchObject({
      ok: true,
      order: { totalMinor: 69_600 },
    });
    const rows = await database.db
      .select()
      .from(orders)
      .where(eq(orders.clientOrderId, clientOrderId));
    expect(rows[0]).toMatchObject({ discountMinor: 7_000, totalMinor: 69_600 });
  });

  it("returns a price conflict without persisting the stale order", async () => {
    await database.db
      .update(outletProducts)
      .set({ priceMinor: 25_000 })
      .where(
        and(
          eq(outletProducts.outletId, first.outlets[0].id),
          eq(outletProducts.productId, first.barProductId),
        ),
      );

    const staleTotal = MIXED_TOTALS.totalMinor;
    const clientOrderId = crypto.randomUUID();
    const stale = await syncPosOrders(database.db, first.actors.cashier.actor, {
      outletId: first.outlets[0].id,
      orders: [
        makeSyncOrder({
          productId: first.barProductId,
          priceMinor: 22_000,
          expectedTotalMinor: staleTotal,
          clientOrderId,
        }),
      ],
    });

    expect(stale.results[0]?.ok).toBe(false);
    if (!stale.results[0] || stale.results[0].ok) throw new Error("Expected a price conflict");
    expect(stale.results[0].error.code).toBe("PRICE_CHANGED");
    expect(stale.results[0].error.details).toMatchObject({
      clientTotalMinor: staleTotal,
      serverSubtotalMinor: 25_000,
    });

    const notPersisted = await database.db
      .select()
      .from(orders)
      .where(eq(orders.clientOrderId, clientOrderId));
    expect(notPersisted).toHaveLength(0);

    const correctedTotal = calculateTotals({ subtotalMinor: 25_000, pricing: PRICING }).totalMinor;
    const corrected = await syncPosOrders(database.db, first.actors.cashier.actor, {
      outletId: first.outlets[0].id,
      orders: [
        makeSyncOrder({
          productId: first.barProductId,
          priceMinor: 25_000,
          expectedTotalMinor: correctedTotal,
          clientOrderId,
        }),
      ],
    });
    expect(corrected.results[0]).toMatchObject({
      ok: true,
      order: { totalMinor: correctedTotal },
    });
  });

  it("persists successful orders from a partially rejected sync batch", async () => {
    const expectedTotalMinor = calculateTotals({
      subtotalMinor: 25_000,
      pricing: PRICING,
    }).totalMinor;
    const firstId = crypto.randomUUID();
    const rejectedId = crypto.randomUUID();
    const lastId = crypto.randomUUID();

    const result = await syncPosOrders(database.db, first.actors.cashier.actor, {
      outletId: first.outlets[0].id,
      orders: [
        makeSyncOrder({
          productId: first.barProductId,
          priceMinor: 25_000,
          expectedTotalMinor,
          clientOrderId: firstId,
        }),
        makeSyncOrder({
          productId: first.barProductId,
          priceMinor: 25_000,
          expectedTotalMinor: expectedTotalMinor + 1,
          clientOrderId: rejectedId,
        }),
        makeSyncOrder({
          productId: first.barProductId,
          priceMinor: 25_000,
          expectedTotalMinor,
          clientOrderId: lastId,
        }),
      ],
    });

    expect(result.results.map((entry) => entry.ok)).toEqual([true, false, true]);
    expect(result.results[1]).toMatchObject({
      clientOrderId: rejectedId,
      ok: false,
      error: { code: "PRICE_CHANGED" },
    });
    const persisted = await database.db.select().from(orders).where(
      sql`${orders.clientOrderId} in (${firstId}, ${lastId}, ${rejectedId})`,
    );
    expect(persisted.map((order) => order.clientOrderId).sort()).toEqual([firstId, lastId].sort());
  });

  it("creates one order when concurrent requests replay the same client order ID", async () => {
    const clientOrderId = crypto.randomUUID();
    const expectedTotalMinor = calculateTotals({
      subtotalMinor: 25_000,
      pricing: PRICING,
    }).totalMinor;
    const input = makeSyncOrder({
      productId: first.barProductId,
      priceMinor: 25_000,
      expectedTotalMinor,
      clientOrderId,
    });

    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        syncPosOrders(database.db, first.actors.cashier.actor, {
          outletId: first.outlets[0].id,
          orders: [input],
        }),
      ),
    );

    expect(results.map((result) => result.results[0]?.ok)).toEqual([true, true]);
    const replayFlags = results.map((result) => {
      const entry = result.results[0];
      return entry?.ok ? entry.order.duplicate : null;
    });
    expect(replayFlags.sort()).toEqual([false, true]);
    const persisted = await database.db
      .select()
      .from(orders)
      .where(eq(orders.clientOrderId, clientOrderId));
    expect(persisted).toHaveLength(1);
  });

  it("allocates distinct order numbers for concurrent unique checkouts", async () => {
    await database.db
      .update(outletProducts)
      .set({ priceMinor: 25_000 })
      .where(
        and(
          eq(outletProducts.outletId, first.outlets[0].id),
          eq(outletProducts.productId, first.barProductId),
        ),
      );
    const expectedTotalMinor = calculateTotals({
      subtotalMinor: 25_000,
      pricing: PRICING,
    }).totalMinor;
    const inputs = Array.from({ length: 5 }, () =>
      makeSyncOrder({
        productId: first.barProductId,
        priceMinor: 25_000,
        expectedTotalMinor,
        clientOrderId: crypto.randomUUID(),
      }),
    );

    const results = await Promise.all(
      inputs.map((order) =>
        syncPosOrders(database.db, first.actors.cashier.actor, {
          outletId: first.outlets[0].id,
          orders: [order],
        }),
      ),
    );

    const orderNumbers = results.map((result) => {
      const entry = result.results[0];
      if (!entry?.ok) throw new Error("A concurrent checkout was rejected.");
      return entry.order.orderNumber;
    });
    expect(new Set(orderNumbers).size).toBe(inputs.length);
    const persisted = await database.db
      .select()
      .from(orders)
      .where(inArray(orders.clientOrderId, inputs.map((order) => order.clientOrderId)));
    expect(persisted).toHaveLength(inputs.length);
  });

  it("rejects a tenant-wide client ID replayed through another outlet", async () => {
    await database.db
      .update(outletProducts)
      .set({ priceMinor: 25_000 })
      .where(
        and(
          eq(outletProducts.outletId, first.outlets[0].id),
          eq(outletProducts.productId, first.barProductId),
        ),
      );
    const clientOrderId = crypto.randomUUID();
    const expectedTotalMinor = calculateTotals({
      subtotalMinor: 25_000,
      pricing: PRICING,
    }).totalMinor;
    const order = makeSyncOrder({
      productId: first.barProductId,
      priceMinor: 25_000,
      expectedTotalMinor,
      clientOrderId,
    });

    const created = await syncPosOrders(database.db, first.actors.cashier.actor, {
      outletId: first.outlets[0].id,
      orders: [order],
    });
    expect(created.results[0]?.ok).toBe(true);

    const replay = await syncPosOrders(database.db, first.actors.cashier.actor, {
      outletId: first.outlets[1].id,
      orders: [order],
    });
    expect(replay.results[0]).toMatchObject({
      clientOrderId,
      ok: false,
      error: { code: "CONFLICT" },
    });
    const persisted = await database.db
      .select()
      .from(orders)
      .where(eq(orders.clientOrderId, clientOrderId));
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.outletId).toBe(first.outlets[0].id);
  });

  it("rolls back order, ticket, and counter writes when a payment constraint fails", async () => {
    const clientOrderId = crypto.randomUUID();
    await database.db
      .update(outletProducts)
      .set({ priceMinor: 25_000 })
      .where(
        and(
          eq(outletProducts.outletId, first.outlets[0].id),
          eq(outletProducts.productId, first.barProductId),
        ),
      );
    const expectedTotalMinor = calculateTotals({
      subtotalMinor: 25_000,
      pricing: PRICING,
    }).totalMinor;
    const beforeCounter = await database.db
      .select({ nextNumber: outletOrderCounters.nextNumber })
      .from(outletOrderCounters)
      .where(eq(outletOrderCounters.outletId, first.outlets[0].id));
    const beforeOrders = await database.db.select().from(orders);
    const beforeLines = await database.db.select().from(orderLines);
    const beforeTickets = await database.db.select().from(stationTickets);
    const beforeTicketItems = await database.db.select().from(stationTicketItems);

    await database.db.execute(
      sql.raw(
        "alter table payments add constraint hansan_e2e_force_payment_failure check (amount_minor < 0) not valid",
      ),
    );
    try {
      await expect(
        syncPosOrders(database.db, first.actors.cashier.actor, {
          outletId: first.outlets[0].id,
          orders: [
            makeSyncOrder({
              productId: first.barProductId,
              priceMinor: 25_000,
              expectedTotalMinor,
              clientOrderId,
            }),
          ],
        }),
      ).rejects.toThrow();
    } finally {
      await database.db.execute(
        sql.raw("alter table payments drop constraint hansan_e2e_force_payment_failure"),
      );
    }

    const afterCounter = await database.db
      .select({ nextNumber: outletOrderCounters.nextNumber })
      .from(outletOrderCounters)
      .where(eq(outletOrderCounters.outletId, first.outlets[0].id));
    expect(afterCounter).toEqual(beforeCounter);
    expect(await database.db.select().from(orders)).toHaveLength(beforeOrders.length);
    expect(await database.db.select().from(orderLines)).toHaveLength(beforeLines.length);
    expect(await database.db.select().from(stationTickets)).toHaveLength(beforeTickets.length);
    expect(await database.db.select().from(stationTicketItems)).toHaveLength(beforeTicketItems.length);
    expect(
      await database.db.select().from(orders).where(eq(orders.clientOrderId, clientOrderId)),
    ).toHaveLength(0);
  });

  it("rejects outlet and catalog access across tenants", async () => {
    await expect(
      syncPosOrders(database.db, second.actors.cashier.actor, {
        outletId: first.outlets[0].id,
        orders: [],
      }),
    ).rejects.toBeInstanceOf(AppError);

    const foreignProduct = await syncPosOrders(database.db, first.actors.cashier.actor, {
      outletId: first.outlets[0].id,
      orders: [
        makeSyncOrder({
          productId: second.barProductId,
          priceMinor: 22_000,
          expectedTotalMinor: 0,
          clientOrderId: crypto.randomUUID(),
        }),
      ],
    });
    expect(foreignProduct.results[0]).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("public storefront and online orders", () => {
  it("selects the lowest outlet code deterministically and pages the same catalog", async () => {
    const storefront = await getPublicStorefront(database.db, first.slug);
    expect(storefront.tenant.slug).toBe(first.slug);
    expect(storefront.catalog.outlet.id).toBe(first.outlets[0].id);
    expect(storefront.catalog.outlet.code).toBe("AAA");
    expect(storefront.catalog.products.length).toBeGreaterThan(0);
    expect(storefront.catalog.products.some((product) => product.id === first.barProductId)).toBe(true);
  });

  it("creates an unpaid dine-in order using server time and server prices", async () => {
    const clientOrderId = crypto.randomUUID();
    const clientOccurredAt = new Date(Date.now() - 86_400_000).toISOString();
    const before = Date.now();

    const result = await createPublicOrder(
      database.db,
      first.slug,
      {
        clientOrderId,
        orderType: "dine-in",
        tableLabel: "  A-12  ",
        customerName: "Guest Test",
        customerPhone: "08123456789",
        lines: [{ productId: first.kitchenProductId, quantity: 1, note: "Less salt" }],
        occurredAt: clientOccurredAt,
      },
      "203.0.113.20",
    );

    const orderRows = await database.db
      .select()
      .from(orders)
      .where(eq(orders.clientOrderId, clientOrderId));
    expect(orderRows).toHaveLength(1);
    const order = orderRows[0]!;

    expect(result).toMatchObject({ status: "placed", paymentStatus: "unpaid", orderNumber: order.orderNumber });
    expect(order.outletId).toBe(first.outlets[0].id);
    expect(order.paymentStatus).toBe("unpaid");
    expect(order.tableLabel).toBe("A-12");
    expect(order.occurredAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(order.occurredAt.toISOString()).not.toBe(clientOccurredAt);
    expect(order.occurredAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    const paymentRows = await database.db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(paymentRows).toHaveLength(0);

    const lines = await database.db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
    expect(lines[0]?.unitPriceMinor).toBe(45_000);
    expect(lines[0]?.note).toBe("Less salt");
  });

  it("is idempotent for a repeated public order id", async () => {
    const clientOrderId = crypto.randomUUID();
    const payload = {
      clientOrderId,
      orderType: "take-away" as const,
      customerName: "Retry Guest",
      customerPhone: "08123456780",
      lines: [{ productId: first.barProductId, quantity: 1, note: "" }],
      occurredAt: new Date().toISOString(),
    };

    const firstResult = await createPublicOrder(database.db, first.slug, payload, "203.0.113.21");
    const secondResult = await createPublicOrder(database.db, first.slug, payload, "203.0.113.21");
    expect(secondResult.orderId).toBe(firstResult.orderId);
    expect(secondResult.orderNumber).toBe(firstResult.orderNumber);

    const rows = await database.db
      .select()
      .from(orders)
      .where(eq(orders.clientOrderId, clientOrderId));
    expect(rows).toHaveLength(1);
  });

  it("defends the table-label rule even when the service is called directly", async () => {
    const base = {
      clientOrderId: crypto.randomUUID(),
      customerName: "Direct Guest",
      customerPhone: "08123456781",
      lines: [{ productId: first.barProductId, quantity: 1, note: "" }],
      occurredAt: new Date().toISOString(),
    };

    await expect(
      createPublicOrder(
        database.db,
        first.slug,
        { ...base, orderType: "dine-in" },
        "203.0.113.22",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(
      createPublicOrder(
        database.db,
        first.slug,
        { ...base, orderType: "take-away", tableLabel: "9" },
        "203.0.113.23",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("kitchen display isolation and completion", () => {
  it("keeps kitchen and bar queues isolated", async () => {
    const kitchenTickets = await listKdsTickets(database.db, first.actors.kitchen.actor, {
      outletId: first.outlets[0].id,
    });
    expect(kitchenTickets.length).toBeGreaterThan(0);
    expect(kitchenTickets.every((ticket) => ticket.station === "kitchen")).toBe(true);

    const barTickets = await listKdsTickets(database.db, first.actors.bar.actor, {
      outletId: first.outlets[0].id,
    });
    expect(barTickets.length).toBeGreaterThan(0);
    expect(barTickets.every((ticket) => ticket.station === "bar")).toBe(true);

    await expect(
      listKdsTickets(database.db, first.actors.bar.actor, {
        outletId: first.outlets[0].id,
        station: "kitchen",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      listKdsTickets(database.db, first.actors.cashier.actor, {
        outletId: first.outlets[0].id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("completes the order only after both station tickets finish, with station and tenant guards", async () => {
    const mixedOrderRows = await database.db
      .select()
      .from(orders)
      .where(eq(orders.clientOrderId, mixedOrderClientId));
    const mixedOrder = mixedOrderRows[0]!;

    const kitchenTickets = await listKdsTickets(database.db, first.actors.kitchen.actor, {
      outletId: first.outlets[0].id,
    });
    const barTickets = await listKdsTickets(database.db, first.actors.bar.actor, {
      outletId: first.outlets[0].id,
    });
    const kitchen = kitchenTickets.find((ticket) => ticket.orderId === mixedOrder.id);
    const bar = barTickets.find((ticket) => ticket.orderId === mixedOrder.id);
    expect(kitchen).toBeDefined();
    expect(bar).toBeDefined();

    await expect(
      transitionTicket(database.db, first.actors.kitchen.actor, kitchen!.id, "ready"),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });

    await expect(
      transitionTicket(database.db, first.actors.kitchen.actor, bar!.id, "accepted"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      transitionTicket(database.db, second.actors.kitchen.actor, kitchen!.id, "accepted"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    for (const status of ["accepted", "preparing", "ready", "completed"] as const) {
      await transitionTicket(database.db, first.actors.kitchen.actor, kitchen!.id, status);
      if (status === "accepted") {
        const events = await database.db
          .select()
          .from(orderEvents)
          .where(
            and(
              eq(orderEvents.orderId, mixedOrder.id),
              eq(orderEvents.type, "ticket.status_changed"),
            ),
          );
        await transitionTicket(database.db, first.actors.kitchen.actor, kitchen!.id, status);
        const retriedEvents = await database.db
          .select()
          .from(orderEvents)
          .where(
            and(
              eq(orderEvents.orderId, mixedOrder.id),
              eq(orderEvents.type, "ticket.status_changed"),
            ),
          );
        expect(retriedEvents).toHaveLength(events.length);
      }
    }

    const midOrder = await database.db.select().from(orders).where(eq(orders.id, mixedOrder.id));
    expect(midOrder[0]?.status).toBe("placed");

    for (const status of ["accepted", "preparing", "ready", "completed"] as const) {
      await transitionTicket(database.db, first.actors.bar.actor, bar!.id, status);
    }

    const completed = await database.db.select().from(orders).where(eq(orders.id, mixedOrder.id));
    expect(completed[0]?.status).toBe("completed");

    const completionEvents = await database.db
      .select()
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, completed[0]!.id), eq(orderEvents.type, "order.completed")));
    expect(completionEvents).toHaveLength(1);
  });
});

describe("HQ isolation and permissions", () => {
  it("shows only the actor's tenant and refuses roles without HQ permission", async () => {
    const publicOrder = await createPublicOrder(
      database.db,
      second.slug,
      {
        clientOrderId: crypto.randomUUID(),
        orderType: "take-away",
        customerName: "Other Guest",
        customerPhone: "08123456782",
        lines: [{ productId: second.barProductId, quantity: 1, note: "" }],
        occurredAt: new Date().toISOString(),
      },
      "203.0.113.30",
    );

    const overview = await getHqOverview(database.db, first.actors.owner.actor);
    expect(overview.recentOrders.some((order) => order.orderNumber === publicOrder.orderNumber)).toBe(
      false,
    );

    await expect(getHqOverview(database.db, first.actors.cashier.actor)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(getHqOverview(database.db, first.actors.finance.actor)).resolves.toBeDefined();
  });
});

import { and, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { isPgUniqueViolation } from "@/db/pg-errors";
import {
  auditLogs,
  orderEvents,
  orderLines,
  orders,
  outletOrderCounters,
  payments,
  stationTicketItems,
  stationTickets,
  tenants,
} from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { assertOutletAccess, requirePermission, type Actor } from "@/modules/identity/rbac";
import { calculateTotals } from "@/modules/shared/money";
import { AppError, ERROR_CODES, isAppError } from "@/modules/shared/errors";
import { findPublicOutlet, getOutletCatalog, loadOutlet } from "./catalog";
import type {
  PublicOrderInput,
  PublicOrderResult,
  SyncOrderInput,
  SyncOrderResult,
  SyncedOrder,
} from "./contracts";

type Executor = AppDb;

interface PersistContext {
  tenantId: string;
  outletId: string;
  actorUserId: string | null;
  actorRole: string;
  actor: Actor | null;
  source: "pos" | "website";
  requirePayment: boolean;
  enforceExpectedTotal: boolean;
  occurredAt: Date;
  input: SyncOrderInput;
}

interface ExistingOrder {
  id: string;
  outletId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalMinor: number;
}

async function findExistingOrder(
  db: Executor,
  tenantId: string,
  clientOrderId: string,
): Promise<ExistingOrder | null> {
  const rows = await db
    .select({
      id: orders.id,
      outletId: orders.outletId,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalMinor: orders.totalMinor,
    })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.clientOrderId, clientOrderId)))
    .limit(1);
  return rows[0] ?? null;
}

async function readCashChange(db: Executor, orderId: string): Promise<number> {
  const rows = await db
    .select({ changeMinor: payments.changeMinor })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.method, "cash")))
    .limit(1);
  return rows[0]?.changeMinor ?? 0;
}

function toSynced(order: ExistingOrder, changeMinor: number, duplicate: boolean): SyncedOrder {
  return {
    clientOrderId: "",
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status as SyncedOrder["status"],
    paymentStatus: order.paymentStatus as SyncedOrder["paymentStatus"],
    totalMinor: order.totalMinor,
    changeMinor,
    duplicate,
  };
}

async function nextOrderNumber(tx: Executor, outletId: string, outletCode: string): Promise<string> {
  const rows = await tx
    .insert(outletOrderCounters)
    .values({ outletId, nextNumber: 1 })
    .onConflictDoUpdate({
      target: outletOrderCounters.outletId,
      set: { nextNumber: sql`${outletOrderCounters.nextNumber} + 1` },
    })
    .returning({ nextNumber: outletOrderCounters.nextNumber });
  const sequence = rows[0]?.nextNumber;
  if (!sequence) throw new AppError(ERROR_CODES.INTERNAL, "Could not allocate an order number");
  return `${outletCode}-${String(sequence).padStart(4, "0")}`;
}

function parseOccurredAt(value: string, maxSkewFutureMs = 10 * 60_000): Date {
  const occurred = new Date(value);
  const now = Date.now();
  if (Number.isNaN(occurred.getTime())) {
    throw new AppError(ERROR_CODES.VALIDATION, "Invalid transaction time");
  }
  if (occurred.getTime() > now + maxSkewFutureMs) {
    throw new AppError(ERROR_CODES.VALIDATION, "Transaction time is in the future");
  }
  if (occurred.getTime() < now - 90 * 24 * 60 * 60_000) {
    throw new AppError(ERROR_CODES.VALIDATION, "Transaction is older than the supported offline window");
  }
  return occurred;
}

async function persistOrder(tx: Executor, context: PersistContext): Promise<SyncedOrder> {
  const { input, tenantId, outletId } = context;

  const existing = await findExistingOrder(tx, tenantId, input.clientOrderId);
  if (existing) {
    if (existing.outletId !== outletId) {
      throw new AppError(ERROR_CODES.CONFLICT, "This transaction id already belongs to another outlet");
    }
    const changeMinor = await readCashChange(tx, existing.id);
    return { ...toSynced(existing, changeMinor, true), clientOrderId: input.clientOrderId };
  }

  const outlet = await loadOutlet(tx, tenantId, outletId);
  const catalog = await getOutletCatalog(tx, tenantId, outletId);
  const productById = new Map(catalog.products.map((product) => [product.id, product]));

  const resolvedLines: {
    productId: string;
    name: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
    station: "kitchen" | "bar";
    note: string;
  }[] = [];

  let subtotalMinor = 0;
  for (const line of input.lines) {
    const product = productById.get(line.productId);
    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "One or more items are no longer available");
    }
    const lineTotalMinor = product.priceMinor * line.quantity;
    subtotalMinor += lineTotalMinor;
    resolvedLines.push({
      productId: product.id,
      name: product.name,
      quantity: line.quantity,
      unitPriceMinor: product.priceMinor,
      lineTotalMinor,
      station: product.station,
      note: line.note,
    });
  }

  if (subtotalMinor <= 0) {
    throw new AppError(ERROR_CODES.VALIDATION, "An order must contain at least one item");
  }

  let discountMinor = 0;
  if (input.discountMinor > 0) {
    if (!context.actor) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "Discounts require an authenticated operator");
    }
    requirePermission(context.actor, "pos:discount");
    if (!input.discountReason || input.discountReason.trim().length < 3) {
      throw new AppError(ERROR_CODES.VALIDATION, "A discount reason is required");
    }
    if (input.discountMinor > subtotalMinor) {
      throw new AppError(ERROR_CODES.VALIDATION, "Discount cannot exceed the subtotal");
    }
    discountMinor = input.discountMinor;
  }

  const totals = calculateTotals({
    subtotalMinor,
    discountMinor,
    pricing: { taxBps: outlet.taxBps, serviceChargeBps: outlet.serviceChargeBps },
  });

  if (context.enforceExpectedTotal && totals.totalMinor !== input.expectedTotalMinor) {
    throw new AppError(ERROR_CODES.PRICE_CHANGED, "Prices changed while this order was offline", {
      serverSubtotalMinor: totals.subtotalMinor,
      serverDiscountMinor: totals.discountMinor,
      serverTaxMinor: totals.taxMinor,
      serverServiceChargeMinor: totals.serviceChargeMinor,
      serverTotalMinor: totals.totalMinor,
      clientTotalMinor: input.expectedTotalMinor,
      catalogVersion: catalog.catalogVersion,
    });
  }

  if (context.requirePayment) {
    if (input.payment.tenderedMinor < totals.totalMinor) {
      throw new AppError(ERROR_CODES.VALIDATION, "Cash tendered is less than the order total", {
        totalMinor: totals.totalMinor,
        tenderedMinor: input.payment.tenderedMinor,
      });
    }
  }

  const occurredAt = context.occurredAt;
  const orderNumber = await nextOrderNumber(tx, outletId, outlet.code);

  const orderRows = await tx
    .insert(orders)
    .values({
      tenantId,
      outletId,
      orderNumber,
      clientOrderId: input.clientOrderId,
      orderType: input.orderType,
      tableLabel: input.tableLabel ?? null,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      status: "placed",
      paymentStatus: context.requirePayment ? "paid" : "unpaid",
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      taxMinor: totals.taxMinor,
      serviceChargeMinor: totals.serviceChargeMinor,
      totalMinor: totals.totalMinor,
      catalogVersion: input.catalogVersion || catalog.catalogVersion,
      createdBy: context.actorUserId,
      occurredAt,
    })
    .returning({ id: orders.id });
  const orderId = orderRows[0]?.id;
  if (!orderId) throw new AppError(ERROR_CODES.INTERNAL, "Could not persist order");

  const lineRows = await tx
    .insert(orderLines)
    .values(
      resolvedLines.map((line) => ({
        orderId,
        tenantId,
        productId: line.productId,
        productName: line.name,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        lineTotalMinor: line.lineTotalMinor,
        station: line.station,
        note: line.note,
      })),
    )
    .returning({ id: orderLines.id, station: orderLines.station, name: orderLines.productName, quantity: orderLines.quantity, note: orderLines.note });

  const byStation = new Map<"kitchen" | "bar", typeof lineRows>();
  for (const line of lineRows) {
    const station = line.station === "bar" ? "bar" : "kitchen";
    const list = byStation.get(station) ?? [];
    list.push(line);
    byStation.set(station, list);
  }

  for (const [station, ticketLines] of byStation) {
    const ticketRows = await tx
      .insert(stationTickets)
      .values({ tenantId, outletId, orderId, station, status: "queued" })
      .returning({ id: stationTickets.id });
    const ticketId = ticketRows[0]?.id;
    if (!ticketId) throw new AppError(ERROR_CODES.INTERNAL, "Could not create station ticket");
    await tx.insert(stationTicketItems).values(
      ticketLines.map((line) => ({
        ticketId,
        orderLineId: line.id,
        name: line.name,
        quantity: line.quantity,
        note: line.note,
      })),
    );
  }

  let changeMinor = 0;
  if (context.requirePayment) {
    changeMinor = input.payment.tenderedMinor - totals.totalMinor;
    await tx.insert(payments).values({
      orderId,
      tenantId,
      method: "cash",
      status: "captured",
      amountMinor: totals.totalMinor,
      tenderedMinor: input.payment.tenderedMinor,
      changeMinor,
      capturedAt: occurredAt,
    });
  }

  await tx.insert(orderEvents).values([
    {
      tenantId,
      outletId,
      orderId,
      type: "order.placed",
      actorId: context.actorUserId,
      payload: {
        source: context.source,
        orderNumber,
        totalMinor: totals.totalMinor,
        paymentStatus: context.requirePayment ? "paid" : "unpaid",
      },
    },
    ...(context.requirePayment
      ? [
          {
            tenantId,
            outletId,
            orderId,
            type: "payment.captured",
            actorId: context.actorUserId,
            payload: { method: "cash", amountMinor: totals.totalMinor },
          },
        ]
      : []),
  ]);

  await tx.insert(auditLogs).values({
    tenantId,
    outletId,
    actorId: context.actorUserId,
    actorRole: context.actorRole,
    action: "order.placed",
    entityType: "order",
    entityId: orderId,
    metadata: {
      source: context.source,
      orderNumber,
      totalMinor: totals.totalMinor,
      discountMinor: totals.discountMinor,
      itemCount: resolvedLines.reduce((sum, line) => sum + line.quantity, 0),
    },
  });

  return {
    clientOrderId: input.clientOrderId,
    orderId,
    orderNumber,
    status: "placed",
    paymentStatus: context.requirePayment ? "paid" : "unpaid",
    totalMinor: totals.totalMinor,
    changeMinor,
    duplicate: false,
  };
}

function parsePosOccurredAt(value: string): Date {
  // A POS device may be offline for days; accept a bounded window and keep the
  // device time as the business time, never silently replace it with sync time.
  return parseOccurredAt(value);
}

export async function syncPosOrders(
  db: AppDb,
  actor: Actor,
  input: { outletId: string; orders: SyncOrderInput[] },
): Promise<{ results: SyncOrderResult[] }> {
  requirePermission(actor, "pos:operate");
  assertOutletAccess(actor, input.outletId);
  await loadOutlet(db, actor.tenantId, input.outletId);

  const results: SyncOrderResult[] = [];

  for (const order of input.orders) {
    try {
      const occurredAt = parsePosOccurredAt(order.occurredAt);
      const synced = await db.transaction(async (tx) =>
        persistOrder(tx as unknown as Executor, {
          tenantId: actor.tenantId,
          outletId: input.outletId,
          actorUserId: actor.userId,
          actorRole: actor.role,
          actor,
          source: "pos",
          requirePayment: true,
          enforceExpectedTotal: true,
          occurredAt,
          input: order,
        }),
      );
      results.push({ clientOrderId: order.clientOrderId, ok: true, order: synced });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        const existing = await findExistingOrder(db, actor.tenantId, order.clientOrderId);
        if (existing) {
          const changeMinor = await readCashChange(db, existing.id);
          results.push({
            clientOrderId: order.clientOrderId,
            ok: true,
            order: {
              ...toSynced(existing, changeMinor, true),
              clientOrderId: order.clientOrderId,
            },
          });
          continue;
        }
      }
      if (isAppError(error)) {
        results.push({
          clientOrderId: order.clientOrderId,
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        });
        continue;
      }
      throw error;
    }
  }

  return { results };
}

export async function createPublicOrder(
  db: AppDb,
  slug: string,
  input: PublicOrderInput,
  clientIpAddress: string,
): Promise<PublicOrderResult> {
  const limit = rateLimit(`public-order:${clientIpAddress}`, 10, 10 * 60_000);
  if (!limit.allowed) {
    throw new AppError(ERROR_CODES.RATE_LIMITED, "Too many orders. Please try again shortly.");
  }

  const tableLabel = input.tableLabel?.trim();
  if (input.orderType === "dine-in" && !tableLabel) {
    throw new AppError(ERROR_CODES.VALIDATION, "A table label is required for dine-in orders", {
      field: "tableLabel",
    });
  }
  if (input.orderType === "take-away" && tableLabel) {
    throw new AppError(ERROR_CODES.VALIDATION, "A table label is only valid for dine-in orders", {
      field: "tableLabel",
    });
  }

  const tenantRows = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(and(eq(tenants.slug, slug), eq(tenants.status, "active")))
    .limit(1);
  const tenant = tenantRows[0];
  if (!tenant) throw new AppError(ERROR_CODES.NOT_FOUND, "Storefront not found");

  const outlet = await findPublicOutlet(db, tenant.id);
  if (!outlet) throw new AppError(ERROR_CODES.NOT_FOUND, "No active outlet");

  const occurredAt = new Date();
  const orderInput: SyncOrderInput = {
    clientOrderId: input.clientOrderId,
    orderType: input.orderType,
    ...(tableLabel ? { tableLabel } : {}),
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    lines: input.lines,
    discountMinor: 0,
    expectedTotalMinor: 0,
    catalogVersion: "",
    occurredAt: occurredAt.toISOString(),
    payment: { method: "cash", tenderedMinor: 0 },
  };

  const synced = await db.transaction(async (tx) =>
    persistOrder(tx as unknown as Executor, {
      tenantId: tenant.id,
      outletId: outlet.id,
      actorUserId: null,
      actorRole: "public",
      actor: null,
      source: "website",
      requirePayment: false,
      enforceExpectedTotal: false,
      occurredAt,
      input: orderInput,
    }),
  );

  return {
    orderId: synced.orderId,
    orderNumber: synced.orderNumber,
    totalMinor: synced.totalMinor,
    status: "placed",
    paymentStatus: "unpaid",
  };
}

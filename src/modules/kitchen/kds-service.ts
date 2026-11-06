import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import {
  auditLogs,
  orderEvents,
  orders,
  stationTicketItems,
  stationTickets,
} from "@/db/schema";
import {
  assertOutletAccess,
  assertStationAccess,
  requirePermission,
  type Actor,
} from "@/modules/identity/rbac";
import { AppError, ERROR_CODES } from "@/modules/shared/errors";

export type TicketStatus = "queued" | "accepted" | "preparing" | "ready" | "completed";

const TICKET_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  queued: ["accepted"],
  accepted: ["preparing"],
  preparing: ["ready"],
  ready: ["completed"],
  completed: [],
};

export interface KdsTicket {
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

function normalizeStation(value: string): "kitchen" | "bar" {
  return value === "bar" ? "bar" : "kitchen";
}

export async function listKdsTickets(
  db: AppDb,
  actor: Actor,
  input: { outletId: string; station?: "kitchen" | "bar" },
): Promise<KdsTicket[]> {
  requirePermission(actor, "kds:view");
  assertOutletAccess(actor, input.outletId);

  let station = input.station;
  if (actor.role === "kitchen") {
    if (station && station !== "kitchen") {
      throw new AppError(ERROR_CODES.FORBIDDEN, "Kitchen staff cannot view the bar queue");
    }
    station = "kitchen";
  } else if (actor.role === "bar") {
    if (station && station !== "bar") {
      throw new AppError(ERROR_CODES.FORBIDDEN, "Bar staff cannot view the kitchen queue");
    }
    station = "bar";
  }

  const conditions = [
    eq(stationTickets.tenantId, actor.tenantId),
    eq(stationTickets.outletId, input.outletId),
    inArray(stationTickets.status, ["queued", "accepted", "preparing", "ready"]),
    ...(station ? [eq(stationTickets.station, station)] : []),
  ];

  const rows = await db
    .select({
      id: stationTickets.id,
      orderId: stationTickets.orderId,
      station: stationTickets.station,
      status: stationTickets.status,
      priority: stationTickets.priority,
      createdAt: stationTickets.createdAt,
      orderNumber: orders.orderNumber,
      orderType: orders.orderType,
      tableLabel: orders.tableLabel,
      customerName: orders.customerName,
      occurredAt: orders.occurredAt,
    })
    .from(stationTickets)
    .innerJoin(orders, eq(stationTickets.orderId, orders.id))
    .where(and(...conditions))
    .orderBy(desc(stationTickets.priority), asc(stationTickets.createdAt))
    .limit(100);

  const ticketIds = rows.map((row) => row.id);
  const items = ticketIds.length
    ? await db
        .select({
          id: stationTicketItems.id,
          ticketId: stationTicketItems.ticketId,
          name: stationTicketItems.name,
          quantity: stationTicketItems.quantity,
          note: stationTicketItems.note,
        })
        .from(stationTicketItems)
        .where(inArray(stationTicketItems.ticketId, ticketIds))
    : [];

  const itemsByTicket = new Map<string, KdsTicket["items"]>();
  for (const item of items) {
    const list = itemsByTicket.get(item.ticketId) ?? [];
    list.push({ id: item.id, name: item.name, quantity: item.quantity, note: item.note });
    itemsByTicket.set(item.ticketId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    station: normalizeStation(row.station),
    status: row.status as TicketStatus,
    priority: row.priority,
    orderType: row.orderType,
    tableLabel: row.tableLabel,
    customerName: row.customerName,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    items: itemsByTicket.get(row.id) ?? [],
  }));
}

export async function transitionTicket(
  db: AppDb,
  actor: Actor,
  ticketId: string,
  to: TicketStatus,
): Promise<KdsTicket> {
  requirePermission(actor, "kds:operate");
  if (!(to in TICKET_TRANSITIONS)) {
    throw new AppError(ERROR_CODES.VALIDATION, "Unknown ticket status");
  }

  return db.transaction(async (tx) => {
    const ticketRows = await tx
      .select()
      .from(stationTickets)
      .where(eq(stationTickets.id, ticketId))
      .limit(1);
    const ticket = ticketRows[0];
    if (!ticket || ticket.tenantId !== actor.tenantId) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "Ticket not found");
    }
    assertOutletAccess(actor, ticket.outletId);
    assertStationAccess(actor, normalizeStation(ticket.station));

    // Serialize completion checks for all stations of this order.
    const orderRows = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        orderType: orders.orderType,
        tableLabel: orders.tableLabel,
        customerName: orders.customerName,
        occurredAt: orders.occurredAt,
      })
      .from(orders)
      .where(and(eq(orders.id, ticket.orderId), eq(orders.tenantId, actor.tenantId)))
      .for("update")
      .limit(1);
    const order = orderRows[0];
    if (!order) throw new AppError(ERROR_CODES.NOT_FOUND, "Order not found");

    const from = ticket.status as TicketStatus;
    if (from === to) {
      // Idempotent retry: no second audit event, no duplicate transition.
      return {
        id: ticket.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        station: normalizeStation(ticket.station),
        status: from,
        priority: ticket.priority,
        orderType: order.orderType,
        tableLabel: order.tableLabel,
        customerName: order.customerName,
        occurredAt: order.occurredAt.toISOString(),
        createdAt: ticket.createdAt.toISOString(),
        items: [],
      };
    }
    if (!TICKET_TRANSITIONS[from].includes(to)) {
      throw new AppError(
        ERROR_CODES.INVALID_TRANSITION,
        `Ticket cannot move from ${from} to ${to}`,
      );
    }

    const now = new Date();
    const patch: Partial<typeof stationTickets.$inferInsert> = {
      status: to,
      updatedAt: now,
      ...(to === "accepted" ? { acceptedAt: now } : {}),
      ...(to === "ready" ? { readyAt: now } : {}),
      ...(to === "completed" ? { completedAt: now } : {}),
    };
    await tx.update(stationTickets).set(patch).where(eq(stationTickets.id, ticket.id));

    await tx.insert(orderEvents).values({
      tenantId: actor.tenantId,
      outletId: ticket.outletId,
      orderId: order.id,
      type: "ticket.status_changed",
      actorId: actor.userId,
      payload: { ticketId: ticket.id, station: normalizeStation(ticket.station), from, to },
    });
    await tx.insert(auditLogs).values({
      tenantId: actor.tenantId,
      outletId: ticket.outletId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: "kds.ticket_transition",
      entityType: "station_ticket",
      entityId: ticket.id,
      metadata: { orderId: order.id, from, to, station: normalizeStation(ticket.station) },
    });

    if (to === "completed") {
      const remaining = await tx
        .select({ id: stationTickets.id })
        .from(stationTickets)
        .where(and(eq(stationTickets.orderId, order.id), ne(stationTickets.status, "completed")))
        .limit(1);
      if (remaining.length === 0) {
        await tx.update(orders).set({ status: "completed", updatedAt: now }).where(eq(orders.id, order.id));
        await tx.insert(orderEvents).values({
          tenantId: actor.tenantId,
          outletId: ticket.outletId,
          orderId: order.id,
          type: "order.completed",
          actorId: actor.userId,
          payload: { orderNumber: order.orderNumber },
        });
      }
    }

    const itemRows = await tx
      .select({
        id: stationTicketItems.id,
        name: stationTicketItems.name,
        quantity: stationTicketItems.quantity,
        note: stationTicketItems.note,
      })
      .from(stationTicketItems)
      .where(eq(stationTicketItems.ticketId, ticket.id));

    return {
      id: ticket.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      station: normalizeStation(ticket.station),
      status: to,
      priority: ticket.priority,
      orderType: order.orderType,
      tableLabel: order.tableLabel,
      customerName: order.customerName,
      occurredAt: order.occurredAt.toISOString(),
      createdAt: ticket.createdAt.toISOString(),
      items: itemRows,
    };
  });
}

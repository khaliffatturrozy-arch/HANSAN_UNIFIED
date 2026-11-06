import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * HANSAN V4 physical schema.
 *
 * Money is stored as integer minor units (`bigint`, JS-safe range). IDR has no
 * fractional unit today; the representation still generalises to currencies
 * with cents. Every business row that is tenant-owned carries `tenant_id`
 * explicitly so isolation does not depend on a join being remembered.
 *
 * State machines are constrained in the database as well as in domain code:
 * application bugs cannot persist an unknown order/ticket/payment state.
 */

const createdAt = timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    createdAt,
  },
  (t) => [
    uniqueIndex("tenants_slug_uq").on(t.slug),
    check("tenants_status_check", sql`${t.status} in ('active','suspended')`),
  ],
);

export const outlets = pgTable(
  "outlets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    taxBps: integer("tax_bps").notNull().default(0),
    serviceChargeBps: integer("service_charge_bps").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt,
  },
  (t) => [
    uniqueIndex("outlets_tenant_code_uq").on(t.tenantId, t.code),
    index("outlets_tenant_idx").on(t.tenantId),
    check("outlets_tax_check", sql`${t.taxBps} between 0 and 10000`),
    check("outlets_service_check", sql`${t.serviceChargeBps} between 0 and 10000`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt,
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt,
  },
  (t) => [
    uniqueIndex("memberships_user_tenant_uq").on(t.userId, t.tenantId),
    index("memberships_tenant_idx").on(t.tenantId),
    check(
      "memberships_role_check",
      sql`${t.role} in ('owner','org_admin','finance','outlet_manager','cashier','kitchen','bar')`,
    ),
  ],
);

/** Explicit outlet grants for non-admin roles. Owner/org_admin see all outlets. */
export const outletGrants = pgTable(
  "outlet_grants",
  {
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "cascade" }),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.membershipId, t.outletId] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    csrfHash: text("csrf_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt,
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("sessions_token_uq").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
    index("sessions_expiry_idx").on(t.expiresAt),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt,
  },
  (t) => [uniqueIndex("categories_tenant_name_uq").on(t.tenantId, t.name)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    basePriceMinor: bigint("base_price_minor", { mode: "number" }).notNull(),
    station: text("station").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("products_tenant_sku_uq").on(t.tenantId, t.sku),
    index("products_tenant_category_idx").on(t.tenantId, t.categoryId),
    check("products_price_check", sql`${t.basePriceMinor} >= 0`),
    check("products_station_check", sql`${t.station} in ('kitchen','bar')`),
  ],
);

/** Outlet-level availability and optional price override. */
export const outletProducts = pgTable(
  "outlet_products",
  {
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    priceMinor: bigint("price_minor", { mode: "number" }),
    available: boolean("available").notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.outletId, t.productId] }),
    check("outlet_products_price_check", sql`${t.priceMinor} is null or ${t.priceMinor} >= 0`),
  ],
);

export const outletOrderCounters = pgTable("outlet_order_counters", {
  outletId: uuid("outlet_id")
    .primaryKey()
    .references(() => outlets.id, { onDelete: "cascade" }),
  nextNumber: integer("next_number").notNull().default(1),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "restrict" }),
    orderNumber: text("order_number").notNull(),
    /** Stable device-generated id. Makes offline retries idempotent. */
    clientOrderId: text("client_order_id").notNull(),
    orderType: text("order_type").notNull(),
    tableLabel: text("table_label"),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    status: text("status").notNull().default("placed"),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull(),
    discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
    taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),
    serviceChargeMinor: bigint("service_charge_minor", { mode: "number" }).notNull().default(0),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    catalogVersion: text("catalog_version").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    /** Device clock time. Reporting uses this, not sync time. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("orders_tenant_client_uq").on(t.tenantId, t.clientOrderId),
    uniqueIndex("orders_outlet_number_uq").on(t.tenantId, t.outletId, t.orderNumber),
    index("orders_outlet_time_idx").on(t.outletId, t.occurredAt),
    index("orders_tenant_time_idx").on(t.tenantId, t.occurredAt),
    check("orders_type_check", sql`${t.orderType} in ('dine-in','take-away','online')`),
    check("orders_status_check", sql`${t.status} in ('placed','completed','cancelled')`),
    check("orders_payment_status_check", sql`${t.paymentStatus} in ('unpaid','paid','refunded')`),
    check(
      "orders_money_check",
      sql`${t.subtotalMinor} >= 0 and ${t.discountMinor} >= 0 and ${t.taxMinor} >= 0 and ${t.serviceChargeMinor} >= 0 and ${t.totalMinor} >= 0`,
    ),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    /** Snapshot: later catalog edits must not rewrite history. */
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    lineTotalMinor: bigint("line_total_minor", { mode: "number" }).notNull(),
    station: text("station").notNull(),
    note: text("note").notNull().default(""),
    createdAt,
  },
  (t) => [
    index("order_lines_order_idx").on(t.orderId),
    check("order_lines_qty_check", sql`${t.quantity} > 0`),
    check("order_lines_station_check", sql`${t.station} in ('kitchen','bar')`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    method: text("method").notNull(),
    status: text("status").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    tenderedMinor: bigint("tendered_minor", { mode: "number" }),
    changeMinor: bigint("change_minor", { mode: "number" }),
    providerRef: text("provider_ref"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    check("payments_method_check", sql`${t.method} in ('cash','qris','edc')`),
    check("payments_status_check", sql`${t.status} in ('pending','captured','failed','refunded')`),
    check("payments_amount_check", sql`${t.amountMinor} >= 0`),
  ],
);

export const stationTickets = pgTable(
  "station_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    station: text("station").notNull(),
    status: text("status").notNull().default("queued"),
    priority: integer("priority").notNull().default(0),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("station_tickets_order_station_uq").on(t.orderId, t.station),
    index("station_tickets_queue_idx").on(t.outletId, t.station, t.status),
    check("station_tickets_station_check", sql`${t.station} in ('kitchen','bar')`),
    check(
      "station_tickets_status_check",
      sql`${t.status} in ('queued','accepted','preparing','ready','completed')`,
    ),
  ],
);

export const stationTicketItems = pgTable(
  "station_ticket_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => stationTickets.id, { onDelete: "cascade" }),
    orderLineId: uuid("order_line_id")
      .notNull()
      .references(() => orderLines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note").notNull().default(""),
    createdAt,
  },
  (t) => [index("station_ticket_items_ticket_idx").on(t.ticketId)],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
  },
  (t) => [
    index("audit_logs_tenant_time_idx").on(t.tenantId, t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);

// ---------------------------------------------------------------------------
// Relations (used by typed relational queries where convenient)
// ---------------------------------------------------------------------------

export const tenantRelations = relations(tenants, ({ many }) => ({
  outlets: many(outlets),
  memberships: many(memberships),
  products: many(products),
}));

export const outletRelations = relations(outlets, ({ one, many }) => ({
  tenant: one(tenants, { fields: [outlets.tenantId], references: [tenants.id] }),
  tickets: many(stationTickets),
  orders: many(orders),
}));

export const membershipRelations = relations(memberships, ({ one, many }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  tenant: one(tenants, { fields: [memberships.tenantId], references: [tenants.id] }),
  grants: many(outletGrants),
}));

export const orderRelations = relations(orders, ({ one, many }) => ({
  outlet: one(outlets, { fields: [orders.outletId], references: [outlets.id] }),
  lines: many(orderLines),
  payments: many(payments),
  tickets: many(stationTickets),
  events: many(orderEvents),
}));

export const orderLineRelations = relations(orderLines, ({ one }) => ({
  order: one(orders, { fields: [orderLines.orderId], references: [orders.id] }),
}));

export const ticketRelations = relations(stationTickets, ({ one, many }) => ({
  order: one(orders, { fields: [stationTickets.orderId], references: [orders.id] }),
  items: many(stationTicketItems),
}));

export type Tenant = typeof tenants.$inferSelect;
export type Outlet = typeof outlets.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderLine = typeof orderLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type StationTicket = typeof stationTickets.$inferSelect;
export type StationTicketItem = typeof stationTicketItems.$inferSelect;

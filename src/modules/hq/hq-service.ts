import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import { isPgUniqueViolation } from "@/db/pg-errors";
import {
  auditLogs,
  categories,
  memberships,
  outletGrants,
  outletOrderCounters,
  outletProducts,
  outlets,
  products,
  stationTickets,
  users,
  orders,
} from "@/db/schema";
import {
  canAccessOutlet,
  isTenantAdmin,
  requirePermission,
  type Actor,
} from "@/modules/identity/rbac";
import { AppError, ERROR_CODES } from "@/modules/shared/errors";

export const createOutletSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,12}$/, "Use 2–12 uppercase letters, digits, or hyphens"),
  taxBps: z.number().int().min(0).max(10_000).default(0),
  serviceChargeBps: z.number().int().min(0).max(10_000).default(0),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,24}$/, "Use 2–24 uppercase letters, digits, or hyphens"),
  categoryId: z.uuid(),
  priceMinor: z.number().int().min(0).max(1_000_000_000),
  station: z.enum(["kitchen", "bar"]),
  description: z.string().trim().max(500).default(""),
});

export const toggleProductSchema = z.object({ active: z.boolean() });

export type CreateOutletInput = z.infer<typeof createOutletSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;

async function visibleOutletIds(db: AppDb, actor: Actor): Promise<string[]> {
  const rows = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(and(eq(outlets.tenantId, actor.tenantId), eq(outlets.active, true)));
  return rows.map((row) => row.id).filter((id) => canAccessOutlet(actor, id));
}

export interface HqOverview {
  kpis: {
    sales24hMinor: number;
    orders24h: number;
    averageOrder24hMinor: number;
    activeOutlets: number;
    openTickets: number;
  };
  series: { day: string; salesMinor: number; orders: number }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    outletName: string;
    orderType: string;
    status: string;
    paymentStatus: string;
    totalMinor: number;
    occurredAt: string;
  }[];
}

export async function getHqOverview(db: AppDb, actor: Actor): Promise<HqOverview> {
  requirePermission(actor, "hq:view");
  const outletIds = await visibleOutletIds(db, actor);
  if (outletIds.length === 0) {
    return {
      kpis: { sales24hMinor: 0, orders24h: 0, averageOrder24hMinor: 0, activeOutlets: 0, openTickets: 0 },
      series: [],
      recentOrders: [],
    };
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60_000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60_000);

  const summaryRows = await db
    .select({
      sales: sql<string>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.totalMinor} else 0 end), 0)::bigint`,
      orderCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(and(inArray(orders.outletId, outletIds), gte(orders.occurredAt, since24h)));
  const summary = summaryRows[0];
  const sales24hMinor = Number(summary?.sales ?? 0);
  const orders24h = Number(summary?.orderCount ?? 0);

  const ticketRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stationTickets)
    .where(
      and(
        eq(stationTickets.tenantId, actor.tenantId),
        inArray(stationTickets.outletId, outletIds),
        inArray(stationTickets.status, ["queued", "accepted", "preparing", "ready"]),
      ),
    );
  const openTickets = Number(ticketRows[0]?.count ?? 0);

  const seriesRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${orders.occurredAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      sales: sql<string>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.totalMinor} else 0 end), 0)::bigint`,
      orderCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(and(inArray(orders.outletId, outletIds), gte(orders.occurredAt, since7d)))
    .groupBy(sql`date_trunc('day', ${orders.occurredAt} at time zone 'UTC')`)
    .orderBy(sql`date_trunc('day', ${orders.occurredAt} at time zone 'UTC')`);

  const series = seriesRows.map((row) => ({
    day: row.day,
    salesMinor: Number(row.sales),
    orders: Number(row.orderCount),
  }));

  const recentRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      outletName: outlets.name,
      orderType: orders.orderType,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalMinor: orders.totalMinor,
      occurredAt: orders.occurredAt,
    })
    .from(orders)
    .innerJoin(outlets, eq(orders.outletId, outlets.id))
    .where(and(eq(orders.tenantId, actor.tenantId), inArray(orders.outletId, outletIds)))
    .orderBy(desc(orders.occurredAt))
    .limit(8);

  return {
    kpis: {
      sales24hMinor,
      orders24h,
      averageOrder24hMinor: orders24h > 0 ? Math.round(sales24hMinor / orders24h) : 0,
      activeOutlets: outletIds.length,
      openTickets,
    },
    series,
    recentOrders: recentRows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      outletName: row.outletName,
      orderType: row.orderType,
      status: row.status,
      paymentStatus: row.paymentStatus,
      totalMinor: row.totalMinor,
      occurredAt: row.occurredAt.toISOString(),
    })),
  };
}

export async function listOutlets(db: AppDb, actor: Actor) {
  requirePermission(actor, "hq:view");
  const rows = await db
    .select()
    .from(outlets)
    .where(eq(outlets.tenantId, actor.tenantId))
    .orderBy(desc(outlets.createdAt));
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    timezone: row.timezone,
    taxBps: row.taxBps,
    serviceChargeBps: row.serviceChargeBps,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createOutlet(db: AppDb, actor: Actor, input: CreateOutletInput) {
  requirePermission(actor, "hq:manage_outlets");
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .insert(outlets)
        .values({
          tenantId: actor.tenantId,
          code: input.code,
          name: input.name,
          taxBps: input.taxBps,
          serviceChargeBps: input.serviceChargeBps,
        })
        .returning();
      const outlet = rows[0];
      if (!outlet) throw new AppError(ERROR_CODES.INTERNAL, "Could not create outlet");
      await tx.insert(outletOrderCounters).values({ outletId: outlet.id });

      // New outlets are made available to tenant administrators explicitly,
      // so outlet access remains a persisted grant rather than an implicit rule.
      const adminMemberships = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.tenantId, actor.tenantId), inArray(memberships.role, ["owner", "org_admin"])));
      if (adminMemberships.length > 0) {
        await tx.insert(outletGrants).values(
          adminMemberships.map((membership) => ({
            membershipId: membership.id,
            outletId: outlet.id,
          })),
        );
      }

      await tx.insert(auditLogs).values({
        tenantId: actor.tenantId,
        outletId: outlet.id,
        actorId: actor.userId,
        actorRole: actor.role,
        action: "outlet.created",
        entityType: "outlet",
        entityId: outlet.id,
        metadata: { code: outlet.code, name: outlet.name, taxBps: outlet.taxBps },
      });

      return {
        id: outlet.id,
        code: outlet.code,
        name: outlet.name,
        timezone: outlet.timezone,
        taxBps: outlet.taxBps,
        serviceChargeBps: outlet.serviceChargeBps,
        active: outlet.active,
        createdAt: outlet.createdAt.toISOString(),
      };
    });
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      throw new AppError(ERROR_CODES.CONFLICT, "An outlet with this code already exists");
    }
    throw error;
  }
}

export async function listCatalog(db: AppDb, actor: Actor) {
  requirePermission(actor, "hq:view");
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      categoryId: categories.id,
      categoryName: categories.name,
      priceMinor: products.basePriceMinor,
      station: products.station,
      active: products.active,
      description: products.description,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.tenantId, actor.tenantId))
    .orderBy(categories.sortOrder, products.name);
  return rows;
}

export async function listCategories(db: AppDb, actor: Actor) {
  requirePermission(actor, "hq:view");
  const rows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.tenantId, actor.tenantId), eq(categories.active, true)))
    .orderBy(categories.sortOrder);
  return rows;
}

export async function createProduct(db: AppDb, actor: Actor, input: CreateProductInput) {
  requirePermission(actor, "hq:manage_catalog");
  try {
    return await db.transaction(async (tx) => {
      const categoryRows = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, input.categoryId), eq(categories.tenantId, actor.tenantId)))
        .limit(1);
      if (!categoryRows[0]) throw new AppError(ERROR_CODES.NOT_FOUND, "Category not found");

      const rows = await tx
        .insert(products)
        .values({
          tenantId: actor.tenantId,
          categoryId: input.categoryId,
          sku: input.sku,
          name: input.name,
          description: input.description,
          basePriceMinor: input.priceMinor,
          station: input.station,
        })
        .returning();
      const product = rows[0];
      if (!product) throw new AppError(ERROR_CODES.INTERNAL, "Could not create product");

      const tenantOutlets = await tx
        .select({ id: outlets.id })
        .from(outlets)
        .where(and(eq(outlets.tenantId, actor.tenantId), eq(outlets.active, true)));
      if (tenantOutlets.length > 0) {
        await tx.insert(outletProducts).values(
          tenantOutlets.map((outlet) => ({ outletId: outlet.id, productId: product.id, available: true })),
        );
      }

      await tx.insert(auditLogs).values({
        tenantId: actor.tenantId,
        outletId: actor.outletId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: "catalog.product_created",
        entityType: "product",
        entityId: product.id,
        metadata: { sku: product.sku, name: product.name, priceMinor: product.basePriceMinor },
      });

      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        categoryId: product.categoryId,
        priceMinor: product.basePriceMinor,
        station: product.station,
        active: product.active,
        description: product.description,
      };
    });
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      throw new AppError(ERROR_CODES.CONFLICT, "A product with this SKU already exists");
    }
    throw error;
  }
}

export async function setProductActive(db: AppDb, actor: Actor, productId: string, active: boolean) {
  requirePermission(actor, "hq:manage_catalog");
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: products.id, tenantId: products.tenantId, name: products.name })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.tenantId, actor.tenantId)))
      .limit(1);
    const product = rows[0];
    if (!product) throw new AppError(ERROR_CODES.NOT_FOUND, "Product not found");
    await tx.update(products).set({ active, updatedAt: new Date() }).where(eq(products.id, product.id));
    await tx.insert(auditLogs).values({
      tenantId: actor.tenantId,
      outletId: actor.outletId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: active ? "catalog.product_activated" : "catalog.product_deactivated",
      entityType: "product",
      entityId: product.id,
      metadata: { name: product.name },
    });
    return { id: product.id, active };
  });
}

export async function listStaff(db: AppDb, actor: Actor) {
  requirePermission(actor, "hq:view_staff");
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
      active: users.active,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.tenantId, actor.tenantId))
    .orderBy(users.displayName);

  const grants = rows.length
    ? await db
        .select({ membershipId: outletGrants.membershipId, outletId: outletGrants.outletId })
        .from(outletGrants)
        .where(inArray(outletGrants.membershipId, rows.map((row) => row.membershipId)))
    : [];

  const grantCount = new Map<string, number>();
  for (const grant of grants) {
    grantCount.set(grant.membershipId, (grantCount.get(grant.membershipId) ?? 0) + 1);
  }

  return rows.map((row) => ({
    userId: row.userId,
    displayName: row.displayName,
    email: row.email,
    active: row.active,
    role: row.role,
    outletCount: isTenantAdmin(row.role as Actor["role"]) ? -1 : (grantCount.get(row.membershipId) ?? 0),
  }));
}

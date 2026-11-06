import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { categories, outletProducts, outlets, products, tenants } from "@/db/schema";
import { AppError, ERROR_CODES } from "@/modules/shared/errors";
import type { CatalogProduct, OutletCatalog } from "./catalog-types";

export type { CatalogProduct, OutletCatalog } from "./catalog-types";

export function computeCatalogVersion(
  entries: { id: string; priceMinor: number; station: string; available: boolean }[],
): string {
  const payload = [...entries]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entry) => `${entry.id}:${entry.priceMinor}:${entry.station}:${entry.available ? 1 : 0}`)
    .join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export async function loadOutlet(db: AppDb, tenantId: string, outletId: string) {
  const rows = await db
    .select()
    .from(outlets)
    .where(and(eq(outlets.id, outletId), eq(outlets.tenantId, tenantId)))
    .limit(1);
  const outlet = rows[0];
  if (!outlet) throw new AppError(ERROR_CODES.NOT_FOUND, "Outlet not found");
  if (!outlet.active) throw new AppError(ERROR_CODES.CONFLICT, "Outlet is not active");
  return outlet;
}

export interface PublicStorefront {
  tenant: { slug: string; name: string };
  catalog: OutletCatalog;
}

/**
 * Deterministic public outlet selection. A tenant can operate many outlets,
 * but the public storefront currently exposes exactly one. Sorting by the
 * human-readable outlet code prevents database row order from silently
 * changing which outlet receives online orders.
 */
export async function findPublicOutlet(db: AppDb, tenantId: string) {
  const rows = await db
    .select({ id: outlets.id, code: outlets.code, name: outlets.name })
    .from(outlets)
    .where(and(eq(outlets.tenantId, tenantId), eq(outlets.active, true)))
    .orderBy(asc(outlets.code), asc(outlets.id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Public storefront resolution. Only active tenants and outlets are visible,
 * and only the public-safe catalog shape is returned.
 */
export async function getPublicStorefront(db: AppDb, slug: string): Promise<PublicStorefront> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
    throw new AppError(ERROR_CODES.NOT_FOUND, "Storefront not found");
  }

  const tenantRows = await db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(and(eq(tenants.slug, slug), eq(tenants.status, "active")))
    .limit(1);
  const tenant = tenantRows[0];
  if (!tenant) throw new AppError(ERROR_CODES.NOT_FOUND, "Storefront not found");

  const outlet = await findPublicOutlet(db, tenant.id);
  if (!outlet) throw new AppError(ERROR_CODES.NOT_FOUND, "Storefront is not accepting orders");

  return {
    tenant: { slug: tenant.slug, name: tenant.name },
    catalog: await getOutletCatalog(db, tenant.id, outlet.id),
  };
}

export async function getOutletCatalog(db: AppDb, tenantId: string, outletId: string): Promise<OutletCatalog> {
  const outlet = await loadOutlet(db, tenantId, outletId);

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      categoryId: categories.id,
      categoryName: categories.name,
      basePriceMinor: products.basePriceMinor,
      outletPriceMinor: outletProducts.priceMinor,
      available: outletProducts.available,
      station: products.station,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(
      outletProducts,
      and(eq(outletProducts.productId, products.id), eq(outletProducts.outletId, outletId)),
    )
    .where(and(eq(products.tenantId, tenantId), eq(products.active, true), eq(categories.active, true)))
    .orderBy(asc(categories.sortOrder), asc(products.name));

  const availableRows = rows.filter((row) => row.available !== false);
  const catalogProducts: CatalogProduct[] = availableRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    priceMinor: row.outletPriceMinor ?? row.basePriceMinor,
    station: row.station === "bar" ? "bar" : "kitchen",
  }));

  const categoryMap = new Map<string, string>();
  for (const product of catalogProducts) {
    categoryMap.set(product.categoryId, product.categoryName);
  }

  return {
    outlet: {
      id: outlet.id,
      name: outlet.name,
      code: outlet.code,
      timezone: outlet.timezone,
      taxBps: outlet.taxBps,
      serviceChargeBps: outlet.serviceChargeBps,
    },
    categories: [...categoryMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    products: catalogProducts,
    catalogVersion: computeCatalogVersion(
      availableRows.map((row) => ({
        id: row.id,
        priceMinor: row.outletPriceMinor ?? row.basePriceMinor,
        station: row.station,
        available: true,
      })),
    ),
  };
}

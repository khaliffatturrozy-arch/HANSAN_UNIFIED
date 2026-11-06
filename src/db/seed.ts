import { eq } from "drizzle-orm";
import type { AppDb } from "./client";
import {
  categories,
  memberships,
  outletGrants,
  outletOrderCounters,
  outletProducts,
  outlets,
  products,
  tenants,
  users,
} from "./schema";
import { hashPassword } from "@/modules/identity/password";
import { getDemoCredentials } from "@/modules/identity/demo-accounts";

const DEMO_PRODUCTS = [
  { category: "Coffee", sku: "ESP-01", name: "Espresso", price: 22_000, station: "bar" as const },
  { category: "Coffee", sku: "LAT-01", name: "Caffè Latte", price: 32_000, station: "bar" as const },
  { category: "Coffee", sku: "COL-01", name: "Cold Brew", price: 34_000, station: "bar" as const },
  { category: "Tea & Drinks", sku: "TEA-01", name: "Iced Tea", price: 18_000, station: "bar" as const },
  { category: "Tea & Drinks", sku: "LIM-01", name: "Lime Fizz", price: 26_000, station: "bar" as const },
  { category: "Kitchen", sku: "NAS-01", name: "Nasi Goreng Kampung", price: 45_000, station: "kitchen" as const },
  { category: "Kitchen", sku: "MEE-01", name: "Mie Goreng Spesial", price: 42_000, station: "kitchen" as const },
  { category: "Kitchen", sku: "AYM-01", name: "Ayam Sambal Matah", price: 55_000, station: "kitchen" as const },
  { category: "Pastry", sku: "CRO-01", name: "Butter Croissant", price: 28_000, station: "kitchen" as const },
  { category: "Pastry", sku: "BAN-01", name: "Banana Bread", price: 24_000, station: "kitchen" as const },
] as const;

export interface SeedResult {
  tenantId: string;
  outletIds: string[];
  created: boolean;
}

/**
 * Idempotent demo seed. This is explicitly demo data; the UI labels it as such.
 * It requires an explicit opt-in and a local-only password, and it refuses to
 * run in production.
 */
export async function seedDemo(db: AppDb): Promise<SeedResult> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo seeding is disabled in production.");
  }
  if (process.env.HANSAN_DEMO_MODE !== "true") {
    throw new Error("Demo seeding requires HANSAN_DEMO_MODE=true.");
  }

  const existing = await db.select().from(tenants).where(eq(tenants.slug, "demo")).limit(1);
  const existingTenant = existing[0];
  if (existingTenant) {
    const existingOutlets = await db.select().from(outlets).where(eq(outlets.tenantId, existingTenant.id));
    return { tenantId: existingTenant.id, outletIds: existingOutlets.map((o) => o.id), created: false };
  }

  const demoCredentials = getDemoCredentials();
  const passwordHashByEmail = new Map<string, string>();
  await Promise.all(
    demoCredentials.map(async (credential) => {
      passwordHashByEmail.set(credential.email, await hashPassword(credential.password));
    }),
  );

  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ slug: "demo", name: "HANSAN Demo Kitchen" })
      .returning();
    if (!tenant) throw new Error("Failed to create demo tenant");

    const [mainOutlet, riverside] = await tx
      .insert(outlets)
      .values([
        {
          tenantId: tenant.id,
          code: "MAIN",
          name: "Demo Kitchen — Main",
          taxBps: 1_100,
          serviceChargeBps: 500,
        },
        {
          tenantId: tenant.id,
          code: "RIVER",
          name: "Demo Kitchen — Riverside",
          taxBps: 1_100,
          serviceChargeBps: 0,
        },
      ])
      .returning();
    if (!mainOutlet || !riverside) throw new Error("Failed to create demo outlets");

    await tx.insert(outletOrderCounters).values([{ outletId: mainOutlet.id }, { outletId: riverside.id }]);

    const categoryNames = ["Coffee", "Tea & Drinks", "Kitchen", "Pastry"];
    const insertedCategories = await tx
      .insert(categories)
      .values(
        categoryNames.map((name, index) => ({
          tenantId: tenant.id,
          name,
          sortOrder: index,
        })),
      )
      .returning();
    const categoryByName = new Map(insertedCategories.map((c) => [c.name, c.id]));

    const insertedProducts = await tx
      .insert(products)
      .values(
        DEMO_PRODUCTS.map((product) => ({
          tenantId: tenant.id,
          categoryId: categoryByName.get(product.category)!,
          sku: product.sku,
          name: product.name,
          basePriceMinor: product.price,
          station: product.station,
          description: "",
        })),
      )
      .returning();

    await tx.insert(outletProducts).values(
      insertedProducts.flatMap((product) =>
        [mainOutlet, riverside].map((outlet) => ({
          outletId: outlet.id,
          productId: product.id,
          available: true,
        })),
      ),
    );

    for (const credential of demoCredentials) {
      const [user] = await tx
        .insert(users)
        .values({
          email: credential.email,
          displayName: credential.label,
          passwordHash: passwordHashByEmail.get(credential.email)!,
        })
        .returning();
      if (!user) throw new Error("Failed to create demo user");

      const [membership] = await tx
        .insert(memberships)
        .values({ userId: user.id, tenantId: tenant.id, role: credential.role })
        .returning();
      if (!membership) throw new Error("Failed to create demo membership");

      await tx.insert(outletGrants).values(
        [mainOutlet, riverside].map((outlet) => ({
          membershipId: membership.id,
          outletId: outlet.id,
        })),
      );
    }

    return { tenantId: tenant.id, outletIds: [mainOutlet.id, riverside.id], created: true };
  });
}

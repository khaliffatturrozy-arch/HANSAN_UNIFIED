import type { AppDb } from "@/db/client";
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
} from "@/db/schema";
import type { Actor, Role } from "@/modules/identity/rbac";

export interface OperatorFixture {
  userId: string;
  membershipId: string;
  actor: Actor;
}

export interface TenantFixture {
  tenantId: string;
  slug: string;
  tenantName: string;
  outlets: [
    { id: string; code: string; name: string },
    { id: string; code: string; name: string },
  ];
  barProductId: string;
  kitchenProductId: string;
  categoryId: string;
  actors: {
    owner: OperatorFixture;
    cashier: OperatorFixture;
    kitchen: OperatorFixture;
    bar: OperatorFixture;
    finance: OperatorFixture;
  };
}

async function makeOperator(
  db: AppDb,
  input: {
    tenantId: string;
    tenantName: string;
    email: string;
    role: Role;
    outletIds: string[];
    outletId: string;
  },
): Promise<OperatorFixture> {
  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      displayName: `${input.role} test`,
      passwordHash: "test-only-not-a-valid-password-hash",
    })
    .returning();
  if (!user) throw new Error("Failed to create test user");

  const [membership] = await db
    .insert(memberships)
    .values({ userId: user.id, tenantId: input.tenantId, role: input.role })
    .returning();
  if (!membership) throw new Error("Failed to create test membership");

  await db.insert(outletGrants).values(
    input.outletIds.map((outletId) => ({
      membershipId: membership.id,
      outletId,
    })),
  );

  return {
    userId: user.id,
    membershipId: membership.id,
    actor: {
      userId: user.id,
      membershipId: membership.id,
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      outletId: input.outletId,
      outletName: "Test outlet",
      role: input.role,
      displayName: `${input.role} test`,
      email: input.email,
      grantedOutletIds: input.outletIds,
    },
  };
}

/**
 * A complete tenant with two active outlets, two products (one per station),
 * and one operator per role used by the permission matrix.
 */
export async function createTenantFixture(
  db: AppDb,
  options: {
    slug?: string;
    name?: string;
    firstOutletCode?: string;
    secondOutletCode?: string;
  } = {},
): Promise<TenantFixture> {
  const slug = options.slug ?? "test-kitchen";
  const tenantName = options.name ?? "Test Kitchen";
  const firstCode = options.firstOutletCode ?? "MAIN";
  const secondCode = options.secondOutletCode ?? "RIVER";

  const [tenant] = await db
    .insert(tenants)
    .values({ slug, name: tenantName })
    .returning();
  if (!tenant) throw new Error("Failed to create test tenant");

  const insertedOutlets = await db
    .insert(outlets)
    .values([
      {
        tenantId: tenant.id,
        code: firstCode,
        name: `${tenantName} First`,
        taxBps: 1_100,
        serviceChargeBps: 500,
      },
      {
        tenantId: tenant.id,
        code: secondCode,
        name: `${tenantName} Second`,
        taxBps: 0,
        serviceChargeBps: 0,
      },
    ])
    .returning();
  const first = insertedOutlets[0];
  const second = insertedOutlets[1];
  if (!first || !second) throw new Error("Failed to create test outlets");

  await db.insert(outletOrderCounters).values([{ outletId: first.id }, { outletId: second.id }]);

  const [category] = await db
    .insert(categories)
    .values({ tenantId: tenant.id, name: "Test Menu", sortOrder: 0 })
    .returning();
  if (!category) throw new Error("Failed to create test category");

  const insertedProducts = await db
    .insert(products)
    .values([
      {
        tenantId: tenant.id,
        categoryId: category.id,
        sku: "TEST-BAR",
        name: "Test Espresso",
        basePriceMinor: 22_000,
        station: "bar",
      },
      {
        tenantId: tenant.id,
        categoryId: category.id,
        sku: "TEST-KIT",
        name: "Test Nasi Goreng",
        basePriceMinor: 45_000,
        station: "kitchen",
      },
    ])
    .returning();
  const barProduct = insertedProducts.find((product) => product.station === "bar");
  const kitchenProduct = insertedProducts.find((product) => product.station === "kitchen");
  if (!barProduct || !kitchenProduct) throw new Error("Failed to create test products");

  await db.insert(outletProducts).values(
    insertedProducts.flatMap((product) =>
      [first, second].map((outlet) => ({
        outletId: outlet.id,
        productId: product.id,
        available: true,
      })),
    ),
  );

  const outletIds = [first.id, second.id];
  const [owner, cashier, kitchen, bar, finance] = await Promise.all([
    makeOperator(db, {
      tenantId: tenant.id,
      tenantName,
      email: `${slug}-owner@test.invalid`,
      role: "owner",
      outletIds,
      outletId: first.id,
    }),
    makeOperator(db, {
      tenantId: tenant.id,
      tenantName,
      email: `${slug}-cashier@test.invalid`,
      role: "cashier",
      outletIds,
      outletId: first.id,
    }),
    makeOperator(db, {
      tenantId: tenant.id,
      tenantName,
      email: `${slug}-kitchen@test.invalid`,
      role: "kitchen",
      outletIds,
      outletId: first.id,
    }),
    makeOperator(db, {
      tenantId: tenant.id,
      tenantName,
      email: `${slug}-bar@test.invalid`,
      role: "bar",
      outletIds,
      outletId: first.id,
    }),
    makeOperator(db, {
      tenantId: tenant.id,
      tenantName,
      email: `${slug}-finance@test.invalid`,
      role: "finance",
      outletIds,
      outletId: first.id,
    }),
  ]);

  return {
    tenantId: tenant.id,
    slug,
    tenantName,
    outlets: [
      { id: first.id, code: first.code, name: first.name },
      { id: second.id, code: second.code, name: second.name },
    ],
    barProductId: barProduct.id,
    kitchenProductId: kitchenProduct.id,
    categoryId: category.id,
    actors: { owner, cashier, kitchen, bar, finance },
  };
}

export function makeSyncOrder(input: {
  productId: string;
  priceMinor: number;
  quantity?: number;
  expectedTotalMinor: number;
  clientOrderId: string;
  orderType?: "dine-in" | "take-away";
  tableLabel?: string;
  tenderedMinor?: number;
  discountMinor?: number;
  discountReason?: string;
  occurredAt?: string;
}) {
  const quantity = input.quantity ?? 1;
  return {
    clientOrderId: input.clientOrderId,
    orderType: input.orderType ?? ("take-away" as const),
    ...(input.tableLabel ? { tableLabel: input.tableLabel } : {}),
    lines: [
      {
        productId: input.productId,
        quantity,
        note: "",
      },
    ],
    discountMinor: input.discountMinor ?? 0,
    ...(input.discountReason ? { discountReason: input.discountReason } : {}),
    expectedTotalMinor: input.expectedTotalMinor,
    catalogVersion: "",
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payment: {
      method: "cash" as const,
      tenderedMinor: input.tenderedMinor ?? input.expectedTotalMinor,
    },
  };
}

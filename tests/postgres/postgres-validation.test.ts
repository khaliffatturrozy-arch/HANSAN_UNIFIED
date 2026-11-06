import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { and, eq } from "drizzle-orm";
import {
  createPostgresTestDatabase,
  migratePostgresDatabase,
  openPostgresDatabase,
  type PostgresTestDatabase,
} from "./helpers";
import { createTenantFixture, makeSyncOrder } from "../helpers/fixtures";
import { pgErrorCode } from "@/db/pg-errors";
import { categories, orders, outletOrderCounters, payments, products, tenants } from "@/db/schema";
import { syncPosOrders } from "@/modules/ordering/order-service";
import { calculateTotals } from "@/modules/shared/money";

/**
 * PostgreSQL-only validation. Runs against a disposable real server, never
 * against PGlite. `npm test` excludes this directory; run it with
 * `npm run test:postgres` and HANSAN_TEST_POSTGRES_URL set.
 */

const PRICING = { taxBps: 1_100, serviceChargeBps: 500 };
const TOTALS = calculateTotals({ subtotalMinor: 22_000, pricing: PRICING });

const EXPECTED_TABLES = [
  "audit_logs",
  "categories",
  "memberships",
  "order_events",
  "order_lines",
  "orders",
  "outlet_grants",
  "outlet_order_counters",
  "outlet_products",
  "outlets",
  "payments",
  "products",
  "sessions",
  "station_ticket_items",
  "station_tickets",
  "tenants",
  "users",
];

const EXPECTED_INDEXES = [
  "tenants_slug_uq",
  "outlets_tenant_code_uq",
  "outlets_tenant_idx",
  "users_email_uq",
  "memberships_user_tenant_uq",
  "memberships_tenant_idx",
  "sessions_token_uq",
  "sessions_user_idx",
  "sessions_expiry_idx",
  "categories_tenant_name_uq",
  "products_tenant_sku_uq",
  "products_tenant_category_idx",
  "orders_tenant_client_uq",
  "orders_outlet_number_uq",
  "orders_outlet_time_idx",
  "orders_tenant_time_idx",
  "order_lines_order_idx",
  "payments_order_idx",
  "station_tickets_order_station_uq",
  "station_tickets_queue_idx",
  "station_ticket_items_ticket_idx",
  "order_events_order_idx",
  "audit_logs_tenant_time_idx",
  "audit_logs_entity_idx",
];

const EXPECTED_CHECKS = [
  "tenants_status_check",
  "outlets_tax_check",
  "outlets_service_check",
  "memberships_role_check",
  "products_price_check",
  "products_station_check",
  "outlet_products_price_check",
  "orders_type_check",
  "orders_status_check",
  "orders_payment_status_check",
  "orders_money_check",
  "order_lines_qty_check",
  "order_lines_station_check",
  "payments_method_check",
  "payments_status_check",
  "payments_amount_check",
  "station_tickets_station_check",
  "station_tickets_status_check",
];

let database: PostgresTestDatabase;

beforeAll(async () => {
  database = await createPostgresTestDatabase();
});

afterAll(async () => {
  if (database) await database.close();
});

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function orderInput(productId: string, clientOrderId: string) {
  return makeSyncOrder({
    productId,
    priceMinor: 22_000,
    expectedTotalMinor: TOTALS.totalMinor,
    clientOrderId,
    tenderedMinor: TOTALS.totalMinor,
  });
}

/** Drizzle wraps driver errors, so assert on the PostgreSQL code in the cause chain. */
async function errorCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return pgErrorCode(error);
  }
}

describe("PostgreSQL connection and lifecycle", () => {
  it("connects to a real PostgreSQL server with the disposable database", async () => {
    const result = await database.pool.query<{
      database: string;
      server_address: string | null;
      version: string;
      version_num: number;
    }>(
      "select current_database() as database, inet_server_addr()::text as server_address, " +
        "version() as version, current_setting('server_version_num')::int as version_num",
    );
    const row = result.rows[0];
    expect(row).toBeDefined();
    expect(row?.database).toBe(database.databaseName);
    expect(row?.server_address).not.toBeNull();
    expect(row?.version).toContain("PostgreSQL");
    expect(row?.version_num).toBeGreaterThanOrEqual(130_000);
  });

  it("closes connections cleanly and refuses queries after shutdown", async () => {
    const throwaway = await createPostgresTestDatabase();
    try {
      const before = await throwaway.pool.query<{ value: number }>("select 1 as value");
      expect(before.rows[0]?.value).toBe(1);

      await throwaway.closePool();
      await expect(throwaway.pool.query("select 1")).rejects.toThrow(/after calling end/i);
    } finally {
      await throwaway.close();
    }
  });
});

describe("Drizzle migrations and physical schema", () => {
  it("applies the real Drizzle migration exactly once", async () => {
    const migrationRows = await database.pool.query<{ count: number }>(
      'select count(*)::int as count from drizzle."__drizzle_migrations"',
    );
    expect(migrationRows.rows[0]?.count).toBe(1);

    const tableRows = await database.pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables " +
        "where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
    );
    expect(tableRows.rows.map((row) => row.table_name)).toEqual(EXPECTED_TABLES);
  });

  it("is idempotent when the migration runner runs again", async () => {
    await migratePostgresDatabase(database);

    const migrationRows = await database.pool.query<{ count: number }>(
      'select count(*)::int as count from drizzle."__drizzle_migrations"',
    );
    expect(migrationRows.rows[0]?.count).toBe(1);
  });

  it("creates the documented indexes and check constraints", async () => {
    const indexRows = await database.pool.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'public'",
    );
    const indexNames = new Set(indexRows.rows.map((row) => row.indexname));
    for (const name of EXPECTED_INDEXES) {
      expect(indexNames.has(name), `missing index ${name}`).toBe(true);
    }

    const checkRows = await database.pool.query<{ conname: string }>(
      "select conname from pg_constraint " +
        "where contype = 'c' and connamespace = 'public'::regnamespace",
    );
    const checkNames = new Set(checkRows.rows.map((row) => row.conname));
    for (const name of EXPECTED_CHECKS) {
      expect(checkNames.has(name), `missing check constraint ${name}`).toBe(true);
    }
  });
});

describe("schema constraints", () => {
  it("rejects invalid states and duplicate business keys", async () => {
    const slug = uniqueSlug("pg-constraints");

    const [tenant] = await database.db
      .insert(tenants)
      .values({ slug, name: "PostgreSQL Constraints" })
      .returning();
    expect(tenant).toBeDefined();

    expect(
      await errorCodeOf(
        database.db.insert(tenants).values({ slug, name: "Duplicate slug" }),
      ),
    ).toBe("23505");

    expect(
      await errorCodeOf(
        database.db
          .insert(tenants)
          .values({ slug: uniqueSlug("pg-bad-status"), name: "Bad", status: "bogus" }),
      ),
    ).toBe("23514");

    expect(
      await errorCodeOf(
        database.db
          .update(tenants)
          .set({ status: "bogus" })
          .where(eq(tenants.id, tenant!.id)),
      ),
    ).toBe("23514");

    const [category] = await database.db
      .insert(categories)
      .values({ tenantId: tenant!.id, name: "PostgreSQL Menu" })
      .returning();
    expect(category).toBeDefined();

    expect(
      await errorCodeOf(
        database.db.insert(products).values({
          tenantId: tenant!.id,
          categoryId: category!.id,
          sku: "PG-NEGATIVE",
          name: "Negative price",
          basePriceMinor: -1,
          station: "bar",
        }),
      ),
    ).toBe("23514");

    expect(
      await errorCodeOf(
        database.db.insert(products).values({
          tenantId: tenant!.id,
          categoryId: category!.id,
          sku: "PG-BAD-STATION",
          name: "Bad station",
          basePriceMinor: 1_000,
          station: "grill",
        }),
      ),
    ).toBe("23514");
  });
});

describe("transactions", () => {
  it("commits and rolls back atomically", async () => {
    const committedSlug = uniqueSlug("pg-commit");
    await database.db.transaction(async (tx) => {
      await tx.insert(tenants).values({ slug: committedSlug, name: "Committed" });
    });
    const committed = await database.db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, committedSlug));
    expect(committed).toHaveLength(1);

    const rolledBackSlug = uniqueSlug("pg-rollback");
    await expect(
      database.db.transaction(async (tx) => {
        await tx.insert(tenants).values({ slug: rolledBackSlug, name: "Rolled Back" });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    const rolledBack = await database.db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, rolledBackSlug));
    expect(rolledBack).toHaveLength(0);
  });
});

describe("concurrent writes and locking", () => {
  it("allocates unique order numbers for concurrent distinct orders", async () => {
    const fixture = await createTenantFixture(database.db, {
      slug: uniqueSlug("pg-concurrent"),
      name: "PostgreSQL Concurrent",
      firstOutletCode: "CON",
      secondOutletCode: "CO2",
    });

    const inputs = Array.from({ length: 8 }, () =>
      orderInput(fixture.barProductId, randomUUID()),
    );
    const results = await Promise.all(
      inputs.map((input) =>
        syncPosOrders(database.db, fixture.actors.cashier.actor, {
          outletId: fixture.outlets[0].id,
          orders: [input],
        }),
      ),
    );

    for (const result of results) {
      expect(result.results[0]?.ok).toBe(true);
    }

    const rows = await database.db
      .select()
      .from(orders)
      .where(eq(orders.outletId, fixture.outlets[0].id));
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((row) => row.orderNumber)).size).toBe(8);
    expect(rows.every((row) => row.tenantId === fixture.tenantId)).toBe(true);
  });

  it("serializes row locks on the order counter", async () => {
    const fixture = await createTenantFixture(database.db, {
      slug: uniqueSlug("pg-lock"),
      name: "PostgreSQL Lock",
      firstOutletCode: "LCK",
      secondOutletCode: "LC2",
    });
    const outletId = fixture.outlets[0].id;

    const locker = await database.pool.connect();
    const waiter = await database.pool.connect();
    try {
      await locker.query("begin");
      await locker.query(
        "select * from outlet_order_counters where outlet_id = $1 for update",
        [outletId],
      );

      let waiterAcquired = false;
      const pending = waiter
        .query("select * from outlet_order_counters where outlet_id = $1 for update", [outletId])
        .then(() => {
          waiterAcquired = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(waiterAcquired).toBe(false);

      await locker.query("commit");
      await pending;
      expect(waiterAcquired).toBe(true);
    } finally {
      await locker.query("rollback").catch(() => {});
      locker.release();
      waiter.release();
    }
  });

  it("creates one order when the same client order id is replayed concurrently", async () => {
    const fixture = await createTenantFixture(database.db, {
      slug: uniqueSlug("pg-race"),
      name: "PostgreSQL Race",
      firstOutletCode: "RAC",
      secondOutletCode: "RA2",
    });
    const clientOrderId = randomUUID();

    const [first, second] = await Promise.all([
      syncPosOrders(database.db, fixture.actors.cashier.actor, {
        outletId: fixture.outlets[0].id,
        orders: [orderInput(fixture.barProductId, clientOrderId)],
      }),
      syncPosOrders(database.db, fixture.actors.cashier.actor, {
        outletId: fixture.outlets[0].id,
        orders: [orderInput(fixture.barProductId, clientOrderId)],
      }),
    ]);

    const outcomes = [first.results[0], second.results[0]];
    expect(outcomes.every((outcome) => outcome?.ok)).toBe(true);
    const duplicateFlags = outcomes
      .map((outcome) => (outcome?.ok ? outcome.order.duplicate : null))
      .sort();
    expect(duplicateFlags).toEqual([false, true]);

    const rows = await database.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, fixture.tenantId),
          eq(orders.clientOrderId, clientOrderId),
        ),
      );
    expect(rows).toHaveLength(1);

    const paymentRows = await database.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, rows[0]!.id));
    expect(paymentRows).toHaveLength(1);
  });
});

describe("POS offline replay and idempotency", () => {
  it("returns the existing order on a sequential replay without duplicating rows", async () => {
    const fixture = await createTenantFixture(database.db, {
      slug: uniqueSlug("pg-replay"),
      name: "PostgreSQL Replay",
      firstOutletCode: "RPY",
      secondOutletCode: "RP2",
    });
    const clientOrderId = randomUUID();
    const input = orderInput(fixture.barProductId, clientOrderId);

    const first = await syncPosOrders(database.db, fixture.actors.cashier.actor, {
      outletId: fixture.outlets[0].id,
      orders: [input],
    });
    expect(first.results[0]).toMatchObject({
      ok: true,
      order: { duplicate: false, totalMinor: TOTALS.totalMinor },
    });

    const replay = await syncPosOrders(database.db, fixture.actors.cashier.actor, {
      outletId: fixture.outlets[0].id,
      orders: [input],
    });
    expect(replay.results[0]).toMatchObject({ ok: true, order: { duplicate: true } });

    const rows = await database.db
      .select()
      .from(orders)
      .where(eq(orders.clientOrderId, clientOrderId));
    expect(rows).toHaveLength(1);
  });

  it("rejects replaying a client order id through another outlet", async () => {
    const fixture = await createTenantFixture(database.db, {
      slug: uniqueSlug("pg-cross-outlet"),
      name: "PostgreSQL Cross Outlet",
      firstOutletCode: "OUT",
      secondOutletCode: "OU2",
    });
    const clientOrderId = randomUUID();
    const input = orderInput(fixture.barProductId, clientOrderId);

    await syncPosOrders(database.db, fixture.actors.cashier.actor, {
      outletId: fixture.outlets[0].id,
      orders: [input],
    });
    const replay = await syncPosOrders(database.db, fixture.actors.cashier.actor, {
      outletId: fixture.outlets[1].id,
      orders: [input],
    });

    expect(replay.results[0]).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    const wrongOutletRows = await database.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.outletId, fixture.outlets[1].id),
          eq(orders.clientOrderId, clientOrderId),
        ),
      );
    expect(wrongOutletRows).toHaveLength(0);
  });
});

describe("tenant and outlet isolation", () => {
  it("keeps orders, counters, and outlet access inside the owning tenant", async () => {
    const first = await createTenantFixture(database.db, {
      slug: uniqueSlug("pg-tenant-a"),
      name: "PostgreSQL Tenant A",
      firstOutletCode: "TAA",
      secondOutletCode: "TA2",
    });
    const second = await createTenantFixture(database.db, {
      slug: uniqueSlug("pg-tenant-b"),
      name: "PostgreSQL Tenant B",
      firstOutletCode: "TBB",
      secondOutletCode: "TB2",
    });

    await syncPosOrders(database.db, first.actors.cashier.actor, {
      outletId: first.outlets[0].id,
      orders: [orderInput(first.barProductId, randomUUID())],
    });
    await syncPosOrders(database.db, second.actors.cashier.actor, {
      outletId: second.outlets[0].id,
      orders: [orderInput(second.barProductId, randomUUID())],
    });

    const firstRows = await database.db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, first.tenantId));
    const secondRows = await database.db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, second.tenantId));
    expect(firstRows).toHaveLength(1);
    expect(secondRows).toHaveLength(1);
    expect(firstRows[0]?.outletId).toBe(first.outlets[0].id);
    expect(secondRows[0]?.outletId).toBe(second.outlets[0].id);

    await expect(
      syncPosOrders(database.db, first.actors.cashier.actor, {
        outletId: second.outlets[0].id,
        orders: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const counterRows = await database.db
      .select()
      .from(outletOrderCounters)
      .where(eq(outletOrderCounters.outletId, first.outlets[0].id));
    expect(counterRows).toHaveLength(1);
    expect(counterRows[0]?.nextNumber).toBeGreaterThan(1);
  });

  it("allows the same client order id in two different tenants", async () => {
    const first = await createTenantFixture(database.db, {
      slug: uniqueSlug("pg-shared-id-a"),
      name: "PostgreSQL Shared ID A",
      firstOutletCode: "SIA",
      secondOutletCode: "SI2",
    });
    const second = await createTenantFixture(database.db, {
      slug: uniqueSlug("pg-shared-id-b"),
      name: "PostgreSQL Shared ID B",
      firstOutletCode: "SIB",
      secondOutletCode: "SB2",
    });
    const clientOrderId = randomUUID();

    const firstResult = await syncPosOrders(database.db, first.actors.cashier.actor, {
      outletId: first.outlets[0].id,
      orders: [orderInput(first.barProductId, clientOrderId)],
    });
    const secondResult = await syncPosOrders(database.db, second.actors.cashier.actor, {
      outletId: second.outlets[0].id,
      orders: [orderInput(second.barProductId, clientOrderId)],
    });

    expect(firstResult.results[0]?.ok).toBe(true);
    expect(secondResult.results[0]?.ok).toBe(true);

    const rows = await database.db
      .select()
      .from(orders)
      .where(eq(orders.clientOrderId, clientOrderId));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.tenantId))).toEqual(
      new Set([first.tenantId, second.tenantId]),
    );
  });
});

describe("persistence across application restart", () => {
  it("keeps committed orders after the connection pool is closed and reopened", async () => {
    const isolated = await createPostgresTestDatabase();
    try {
      const fixture = await createTenantFixture(isolated.db, {
        slug: uniqueSlug("pg-restart"),
        name: "PostgreSQL Restart",
        firstOutletCode: "RST",
        secondOutletCode: "RS2",
      });
      const clientOrderId = randomUUID();
      const synced = await syncPosOrders(isolated.db, fixture.actors.cashier.actor, {
        outletId: fixture.outlets[0].id,
        orders: [orderInput(fixture.barProductId, clientOrderId)],
      });
      expect(synced.results[0]?.ok).toBe(true);

      await isolated.closePool();

      const reopened = await openPostgresDatabase(isolated.adminUrl, isolated.databaseName);
      try {
        const rows = await reopened.db
          .select()
          .from(orders)
          .where(eq(orders.clientOrderId, clientOrderId));
        expect(rows).toHaveLength(1);
        const order = rows[0]!;
        expect(order.tenantId).toBe(fixture.tenantId);
        expect(order.outletId).toBe(fixture.outlets[0].id);

        const paymentRows = await reopened.db
          .select()
          .from(payments)
          .where(eq(payments.orderId, order.id));
        expect(paymentRows).toHaveLength(1);
      } finally {
        await reopened.pool.end();
      }
    } finally {
      await isolated.close();
    }
  });
});

describe("database errors and recovery", () => {
  it("surfaces SQL errors and keeps the pool usable", async () => {
    expect(
      await errorCodeOf(database.pool.query("select * from table_that_does_not_exist")),
    ).toBe("42P01");

    const after = await database.pool.query<{ value: number }>("select 1 as value");
    expect(after.rows[0]?.value).toBe(1);
  });

  it("recovers after the server terminates active connections", async () => {
    const before = await database.pool.query<{ count: number }>(
      "select count(*)::int as count from orders",
    );

    const admin = new Client({ connectionString: database.adminUrl });
    await admin.connect();
    try {
      await admin.query(
        "select pg_terminate_backend(pid) from pg_stat_activity " +
          "where datname = $1 and pid <> pg_backend_pid()",
        [database.databaseName],
      );
    } finally {
      await admin.end();
    }

    let recovered = false;
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const after = await database.pool.query<{ count: number }>(
          "select count(*)::int as count from orders",
        );
        if (Number(after.rows[0]?.count) === Number(before.rows[0]?.count)) {
          recovered = true;
          break;
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(recovered, `pool did not recover: ${String(lastError)}`).toBe(true);
  });
});

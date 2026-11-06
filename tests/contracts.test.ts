import { describe, expect, it } from "vitest";
import { computeCatalogVersion } from "@/modules/ordering/catalog";
import { publicOrderSchema, syncOrderSchema } from "@/modules/ordering/contracts";

const clientOrderId = "e3e8c9d4-0e26-4ad7-9b69-533032ae60a8";
const productId = "7bf4c1aa-550d-4bf4-bf4b-a1b0c4f50743";

function publicOrder(overrides: Record<string, unknown> = {}) {
  return {
    clientOrderId,
    orderType: "take-away" as const,
    customerName: "Test Guest",
    customerPhone: "08123456789",
    lines: [{ productId, quantity: 1 }],
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ordering contracts", () => {
  it("requires a table label for dine-in public orders", () => {
    const result = publicOrderSchema.safeParse(publicOrder({ orderType: "dine-in" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("tableLabel"))).toBe(true);
    }
  });

  it("rejects a table label on pick-up public orders", () => {
    const result = publicOrderSchema.safeParse(publicOrder({ tableLabel: "12" }));
    expect(result.success).toBe(false);
  });

  it("trims and accepts a valid dine-in table label", () => {
    const result = publicOrderSchema.parse(
      publicOrder({ orderType: "dine-in", tableLabel: "  A-12  " }),
    );
    expect(result.tableLabel).toBe("A-12");
  });

  it("does not accept unsupported offline payment methods in POS sync", () => {
    const result = syncOrderSchema.safeParse({
      clientOrderId,
      orderType: "take-away",
      lines: [{ productId, quantity: 1 }],
      discountMinor: 0,
      expectedTotalMinor: 22_000,
      catalogVersion: "abc",
      occurredAt: new Date().toISOString(),
      payment: { method: "qris", tenderedMinor: 22_000 },
    });
    expect(result.success).toBe(false);
  });
});

describe("catalog versioning", () => {
  const entries = [
    { id: "b", priceMinor: 20_000, station: "bar", available: true },
    { id: "a", priceMinor: 30_000, station: "kitchen", available: true },
  ];

  it("is stable regardless of row order", () => {
    expect(computeCatalogVersion(entries)).toBe(computeCatalogVersion([...entries].reverse()));
  });

  it("changes when a price, station, or availability changes", () => {
    const base = computeCatalogVersion(entries);
    expect(computeCatalogVersion([{ ...entries[0]!, priceMinor: 21_000 }, entries[1]!])).not.toBe(base);
    expect(computeCatalogVersion([{ ...entries[0]!, station: "kitchen" }, entries[1]!])).not.toBe(base);
    expect(computeCatalogVersion([{ ...entries[0]!, available: false }, entries[1]!])).not.toBe(base);
  });
});

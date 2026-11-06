import { describe, expect, it } from "vitest";
import {
  applyBps,
  calculateTotals,
  formatMoney,
  parseRupiahInput,
} from "@/modules/shared/money";

describe("money and pricing", () => {
  it("calculates tax and service on the discounted subtotal using integer minor units", () => {
    const totals = calculateTotals({
      subtotalMinor: 100_000,
      discountMinor: 10_000,
      pricing: { taxBps: 1_100, serviceChargeBps: 500 },
    });

    expect(totals).toEqual({
      subtotalMinor: 100_000,
      discountMinor: 10_000,
      taxMinor: 9_900,
      serviceChargeMinor: 4_500,
      totalMinor: 104_400,
    });
  });

  it("rounds basis points half up without floating-point drift", () => {
    expect(applyBps(45_000, 1_100)).toBe(4_950);
    expect(applyBps(199, 250)).toBe(5);
    expect(applyBps(1, 500)).toBe(0);
    expect(applyBps(10_000, 10_000)).toBe(10_000);
  });

  it("clamps discounts to the subtotal", () => {
    const totals = calculateTotals({
      subtotalMinor: 20_000,
      discountMinor: 25_000,
      pricing: { taxBps: 0, serviceChargeBps: 0 },
    });
    expect(totals.discountMinor).toBe(20_000);
    expect(totals.totalMinor).toBe(0);
  });

  it("rejects negative or fractional money inputs", () => {
    expect(() => applyBps(-1, 1_100)).toThrow();
    expect(() => applyBps(1.5, 1_100)).toThrow();
    expect(() => applyBps(1_000, -1)).toThrow();
    expect(() => applyBps(1_000, 10_001)).toThrow();
    expect(() =>
      calculateTotals({ subtotalMinor: 100, discountMinor: -1, pricing: { taxBps: 0, serviceChargeBps: 0 } }),
    ).toThrow();
  });

  it("parses common rupiah entry formats and rejects empty values", () => {
    expect(parseRupiahInput("Rp 15.000")).toBe(15_000);
    expect(parseRupiahInput("1,250,000")).toBe(1_250_000);
    expect(parseRupiahInput("")).toBeNull();
    expect(parseRupiahInput("rupiah")).toBeNull();
  });

  it("formats IDR without fractional digits", () => {
    expect(formatMoney(77_720)).toMatch(/77\.720/);
  });
});

/**
 * Money and pricing — the single implementation shared by server, POS browser,
 * and tests. All amounts are integer minor units. IDR's minor unit is 1 rupiah.
 */

export const CURRENCY = "IDR";

export interface PricingConfig {
  /** Tax in basis points (1100 = 11%). */
  taxBps: number;
  /** Service charge in basis points. */
  serviceChargeBps: number;
}

export interface OrderTotals {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceChargeMinor: number;
  totalMinor: number;
}

export function assertIntegerMinor(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

/** Round half up without floating-point drift for non-negative integers. */
export function applyBps(amountMinor: number, bps: number): number {
  assertIntegerMinor(amountMinor, "amountMinor");
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error("bps must be an integer between 0 and 10000");
  }
  return Math.floor((amountMinor * bps + 5_000) / 10_000);
}

export function calculateTotals(input: {
  subtotalMinor: number;
  discountMinor?: number;
  pricing: PricingConfig;
}): OrderTotals {
  const { subtotalMinor, pricing } = input;
  assertIntegerMinor(subtotalMinor, "subtotalMinor");
  assertIntegerMinor(input.discountMinor ?? 0, "discountMinor");

  const discountMinor = Math.min(input.discountMinor ?? 0, subtotalMinor);
  const discounted = subtotalMinor - discountMinor;
  const taxMinor = applyBps(discounted, pricing.taxBps);
  const serviceChargeMinor = applyBps(discounted, pricing.serviceChargeBps);
  const totalMinor = discounted + taxMinor + serviceChargeMinor;

  return { subtotalMinor, discountMinor, taxMinor, serviceChargeMinor, totalMinor };
}

const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const plainFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

export function formatMoney(minor: number): string {
  return idrFormatter.format(minor);
}

export function formatAmount(minor: number): string {
  return plainFormatter.format(minor);
}

/** Parse a user-entered rupiah amount ("15.000", "Rp 15.000", "15000"). */
export function parseRupiahInput(input: string): number | null {
  const cleaned = input.replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}

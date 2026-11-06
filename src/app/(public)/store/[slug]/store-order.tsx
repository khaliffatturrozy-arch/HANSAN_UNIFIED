"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle,
  ChefHat,
  Coffee,
  MagnifyingGlass,
  Minus,
  Plus,
  Receipt,
  ShoppingCart,
  Storefront,
  WarningCircle,
} from "@phosphor-icons/react";
import { apiRequest, errorMessage } from "@/lib/client-api";
import {
  calculateTotals,
  formatMoney,
} from "@/modules/shared/money";
import type { OutletCatalog } from "@/modules/ordering/catalog-types";
import { formatBps, titleCase } from "@/lib/format";

interface StorefrontData {
  tenant: { slug: string; name: string };
  catalog: OutletCatalog;
}

interface BasketLine {
  productId: string;
  name: string;
  unitPriceMinor: number;
  quantity: number;
}

interface PublicOrderResponse {
  order: {
    orderId: string;
    orderNumber: string;
    totalMinor: number;
    status: "placed";
    paymentStatus: "unpaid";
  };
}

export function StoreOrder({
  storefront,
  demoMode,
}: {
  storefront: StorefrontData;
  demoMode: boolean;
}) {
  const { catalog, tenant } = storefront;
  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [orderType, setOrderType] = useState<"take-away" | "dine-in">("take-away");
  const [tableLabel, setTableLabel] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicOrderResponse["order"] | null>(null);
  const clientOrderIdRef = useRef<string | null>(null);

  const pricing = {
    taxBps: catalog.outlet.taxBps,
    serviceChargeBps: catalog.outlet.serviceChargeBps,
  };
  const subtotalMinor = basket.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);
  const totals = calculateTotals({ subtotalMinor, pricing });
  const itemCount = basket.reduce((sum, line) => sum + line.quantity, 0);

  const products = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.products.filter((product) => {
      if (categoryId !== "all" && product.categoryId !== categoryId) return false;
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        product.description.toLowerCase().includes(needle)
      );
    });
  }, [catalog.products, categoryId, query]);

  function add(productId: string) {
    const product = catalog.products.find((item) => item.id === productId);
    if (!product) return;
    setBasket((current) => {
      const existing = current.find((line) => line.productId === productId);
      if (existing) {
        return current.map((line) =>
          line.productId === productId ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          unitPriceMinor: product.priceMinor,
          quantity: 1,
        },
      ];
    });
    setError(null);
  }

  function setQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setBasket((current) => current.filter((line) => line.productId !== productId));
      return;
    }
    setBasket((current) =>
      current.map((line) =>
        line.productId === productId ? { ...line, quantity: Math.min(99, quantity) } : line,
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (basket.length === 0) {
      setError("Add at least one item before placing the order.");
      return;
    }
    if (orderType === "dine-in" && !tableLabel.trim()) {
      setError("Enter a table label for dine-in orders.");
      return;
    }
    if (customerName.trim().length < 2) {
      setError("Enter your name (at least 2 characters).");
      return;
    }
    if (customerPhone.trim().length < 7) {
      setError("Enter a phone number with at least 7 digits.");
      return;
    }

    if (!clientOrderIdRef.current) {
      clientOrderIdRef.current = crypto.randomUUID();
    }

    setBusy(true);
    try {
      const data = await apiRequest<PublicOrderResponse>(`/api/public/${tenant.slug}/orders`, {
        method: "POST",
        body: {
          clientOrderId: clientOrderIdRef.current,
          orderType,
          ...(tableLabel.trim() ? { tableLabel: tableLabel.trim() } : {}),
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          lines: basket.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          occurredAt: new Date().toISOString(),
        },
      });
      setResult(data.order);
      setBasket([]);
      clientOrderIdRef.current = null;
    } catch (cause) {
      // Keep clientOrderIdRef so a retry after an ambiguous network failure is
      // idempotent and cannot create a second order.
      setError(`${errorMessage(cause)} You can retry safely; the order ID is unchanged.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="border-b border-ink/20 bg-paper">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:py-10">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="h-badge h-badge-orange">Online ordering</span>
              {demoMode ? <span className="h-badge h-badge-ink">Demo tenant</span> : null}
              <span className="h-badge">Pay at counter</span>
            </div>
            <p className="h-eyebrow text-muted">Storefront / {tenant.slug}</p>
            <h1 className="h-display mt-2 text-[40px] sm:text-[52px]">{tenant.name}</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Order pick-up or dine-in from the live menu. Prices, tax, and service are calculated
              by the same engine as the counter. This order is unpaid until you pay at the counter.
            </p>
          </div>

          <div className="grid grid-cols-3 divide-x divide-ink/20 border-y border-ink/20">
            {[
              ["Pickup", "or dine-in"],
              ["Unpaid", "online"],
              ["Cash", "at counter"],
            ].map(([value, label]) => (
              <div
                key={label}
                className="flex min-h-16 flex-col justify-end px-3 py-2 text-ink"
              >
                <p className="text-[15px] font-extrabold leading-tight">{value}</p>
                <p className="h-label mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-label="Menu">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <MagnifyingGlass size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                <label htmlFor="store-search" className="sr-only">Search the menu</label>
                <input
                  id="store-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-input pl-10"
                  placeholder="Search the menu…"
                  type="search"
                />
              </div>
              <p className="h-label self-center text-right">{products.length} items</p>
            </div>

            <div className="h-scroll mb-4 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Categories">
              <button
                type="button"
                onClick={() => setCategoryId("all")}
                data-active={categoryId === "all"}
                className="h-chip flex-none"
              >
                All
              </button>
              {catalog.categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryId(category.id)}
                  data-active={categoryId === category.id}
                  className="h-chip flex-none"
                >
                  {category.name}
                </button>
              ))}
            </div>

            {products.length === 0 ? (
              <div className="h-card grid place-items-center px-4 py-16 text-center">
                <p className="text-sm font-extrabold">No dishes match.</p>
                <p className="mt-1 text-xs text-muted">Try another category or search term.</p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {products.map((product) => {
                  const inBasket = basket.find((line) => line.productId === product.id)?.quantity ?? 0;
                  return (
                    <article
                      key={product.id}
                      className="flex min-h-[124px] flex-col justify-between border-b border-ink/20 bg-white px-3 py-4"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-ink/40 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-muted">
                            {product.station === "bar" ? <Coffee size={10} aria-hidden="true" /> : <ChefHat size={10} aria-hidden="true" />}
                            {product.station}
                          </span>
                          {inBasket > 0 ? <span className="h-badge h-badge-blue">{inBasket} in basket</span> : null}
                        </div>
                        <h2 className="mt-2 text-[16px] font-extrabold leading-tight">{product.name}</h2>
                        {product.description ? (
                          <p className="mt-1 text-[11px] font-semibold leading-relaxed text-muted">{product.description}</p>
                        ) : (
                          <p className="mt-1 text-[11px] font-semibold text-muted">{product.categoryName}</p>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="h-num text-[14px] font-extrabold">{formatMoney(product.priceMinor)}</p>
                        {inBasket > 0 ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setQuantity(product.id, inBasket - 1)}
                              className="grid h-9 w-9 place-items-center border border-ink/25 bg-white"
                              aria-label={`Remove one ${product.name}`}
                            >
                              <Minus size={14} weight="bold" aria-hidden="true" />
                            </button>
                            <span className="h-mono w-6 text-center text-[12px] font-black">{inBasket}</span>
                            <button
                              type="button"
                              onClick={() => add(product.id)}
                              className="grid h-9 w-9 place-items-center border border-ink bg-brand-orange"
                              aria-label={`Add one ${product.name}`}
                            >
                              <Plus size={14} weight="bold" aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => add(product.id)} className="h-btn h-btn-sm h-btn-primary">
                            <Plus size={14} weight="bold" aria-hidden="true" />
                            Add
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside id="order-basket" className="lg:sticky lg:top-4 lg:self-start" aria-label="Your order">
            {result ? (
              <div className="h-card overflow-hidden">
                <div className="border-b-2 border-ink bg-brand-green p-4 text-white">
                  <CheckCircle size={30} weight="fill" aria-hidden="true" />
                  <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/75">Order placed</p>
                  <p className="h-mono mt-1 text-2xl font-black">{result.orderNumber}</p>
                </div>
                <div className="p-4">
                  <p className="text-sm font-extrabold">Pay at the counter.</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">
                    This order is <strong>unpaid</strong>. Show order number{" "}
                    <strong>{result.orderNumber}</strong> at the counter. Total due:{" "}
                    <strong>{formatMoney(result.totalMinor)}</strong>.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="h-badge h-badge-orange">Unpaid</span>
                    <span className="h-badge h-badge-blue">Placed</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="h-btn h-btn-primary mt-4 w-full"
                  >
                    Place another order
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="h-card overflow-hidden" noValidate>
                <div className="flex items-center justify-between gap-2 border-b-2 border-ink bg-ivory px-4 py-3">
                  <div>
                    <p className="h-label">Your basket</p>
                    <p className="text-[13px] font-extrabold">
                      {itemCount} item{itemCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ShoppingCart size={20} aria-hidden="true" />
                </div>

                <div className="p-4">
                  <div className="mb-3 grid grid-cols-2 gap-1.5" role="group" aria-label="Order type">
                    {(["take-away", "dine-in"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setOrderType(type)}
                        aria-pressed={orderType === type}
                        className="h-btn h-btn-sm"
                        style={{
                          background: orderType === type ? "#121212" : "transparent",
                          color: orderType === type ? "#FFF5D5" : "#121212",
                        }}
                      >
                        {type === "take-away" ? "Pick up" : "Dine in"}
                      </button>
                    ))}
                  </div>

                  {orderType === "dine-in" ? (
                    <div className="h-field mb-3">
                      <label htmlFor="store-table" className="text-[11px] font-extrabold">Table label</label>
                      <input
                        id="store-table"
                        className="h-input"
                        value={tableLabel}
                        onChange={(event) => setTableLabel(event.target.value.slice(0, 32))}
                        placeholder="e.g. 12"
                      />
                    </div>
                  ) : null}

                  {basket.length === 0 ? (
                    <div className="grid place-items-center border-2 border-dashed border-ink/25 px-3 py-10 text-center" style={{ borderRadius: 10 }}>
                      <Storefront size={30} weight="light" aria-hidden="true" />
                      <p className="mt-2 text-[12px] font-extrabold">Your basket is empty.</p>
                      <p className="mt-1 text-[10px] font-semibold text-muted">Add a dish from the menu.</p>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {basket.map((line) => (
                        <li key={line.productId} className="border-b border-ink/15 bg-ivory/50 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[12px] font-extrabold leading-tight">{line.name}</p>
                            <p className="h-num text-[12px] font-extrabold">
                              {formatMoney(line.unitPriceMinor * line.quantity)}
                            </p>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setQuantity(line.productId, line.quantity - 1)}
                              className="grid h-8 w-8 place-items-center border border-ink/20 bg-white"
                              aria-label={`Remove one ${line.name}`}
                            >
                              <Minus size={13} weight="bold" aria-hidden="true" />
                            </button>
                            <span className="h-mono w-7 text-center text-[12px] font-black">{line.quantity}</span>
                            <button
                              type="button"
                              onClick={() => setQuantity(line.productId, line.quantity + 1)}
                              className="grid h-8 w-8 place-items-center border border-ink/20 bg-white"
                              aria-label={`Add one ${line.name}`}
                            >
                              <Plus size={13} weight="bold" aria-hidden="true" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <dl className="mt-3 space-y-1 border-t-2 border-ink pt-2 text-[12px]">
                    <div className="flex justify-between">
                      <dt className="font-semibold text-muted">Subtotal</dt>
                      <dd className="h-num font-bold">{formatMoney(totals.subtotalMinor)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-semibold text-muted">Tax · {formatBps(pricing.taxBps)}</dt>
                      <dd className="h-num font-bold">{formatMoney(totals.taxMinor)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-semibold text-muted">Service · {formatBps(pricing.serviceChargeBps)}</dt>
                      <dd className="h-num font-bold">{formatMoney(totals.serviceChargeMinor)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between border-t-2 border-ink pt-2">
                      <dt className="text-[13px] font-black">Estimated total</dt>
                      <dd className="h-num text-[20px] font-black">{formatMoney(totals.totalMinor)}</dd>
                    </div>
                  </dl>
                  <p className="mt-1 text-[9px] font-semibold text-muted">
                    Server re-prices the order before accepting it. The confirmation shows the final amount due.
                  </p>

                  <div className="mt-3 grid gap-2">
                    <div className="h-field">
                      <label htmlFor="store-name" className="text-[11px] font-extrabold">Your name</label>
                      <input
                        id="store-name"
                        className="h-input"
                        autoComplete="name"
                        value={customerName}
                        onChange={(event) => setCustomerName(event.target.value.slice(0, 120))}
                        placeholder="Name for the order"
                        required
                      />
                    </div>
                    <div className="h-field">
                      <label htmlFor="store-phone" className="text-[11px] font-extrabold">Phone</label>
                      <input
                        id="store-phone"
                        className="h-input"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={customerPhone}
                        onChange={(event) => setCustomerPhone(event.target.value.slice(0, 40))}
                        placeholder="Mobile number"
                        required
                      />
                    </div>
                  </div>

                  {error ? (
                    <div className="h-error mt-3 text-[11px]" role="alert">
                      <WarningCircle size={16} weight="fill" className="mt-0.5 flex-none" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  ) : null}

                  <button type="submit" className="h-btn h-btn-primary mt-3 w-full" disabled={busy || basket.length === 0}>
                    <Receipt size={17} weight="bold" aria-hidden="true" />
                    {busy ? "Placing order…" : `Place order · ${formatMoney(totals.totalMinor)}`}
                  </button>

                  <p className="mt-2 text-center text-[9px] font-semibold leading-relaxed text-muted">
                    No card details are collected. This order is unpaid and must be paid at the
                    counter. You will receive an order number immediately.
                  </p>
                </div>
              </form>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

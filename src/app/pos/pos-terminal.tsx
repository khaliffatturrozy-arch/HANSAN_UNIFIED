"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowClockwise,
  ArrowRight,
  CaretDown,
  CheckCircle,
  ChefHat,
  CloudArrowUp,
  Coffee,
  ListChecks,
  MagnifyingGlass,
  Minus,
  Plus,
  Receipt,
  ShoppingCart,
  SquaresFour,
  Trash,
  WarningCircle,
  WifiHigh,
  WifiSlash,
} from "@phosphor-icons/react";
import { Wordmark } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { ApiError, apiRequest, errorMessage } from "@/lib/client-api";
import { formatBps, formatTime, titleCase } from "@/lib/format";
import {
  cacheBootstrap,
  deleteOrder,
  enqueueOrder,
  getCachedBootstrap,
  getLastOutletId,
  getLastSyncAt,
  listOrders,
  makeLocalNumber,
  newClientOrderId,
  pruneSyncedOrders,
  setLastOutletId,
} from "@/lib/pos/storage";
import { syncQueuedOrders } from "@/lib/pos/sync";
import type { CartLine, PosBootstrap, QueuedOrder } from "@/lib/pos/types";
import { calculateTotals, formatMoney, parseRupiahInput } from "@/modules/shared/money";
import { PosQueue } from "./pos-queue";
import { PosReceipt } from "./pos-receipt";

type Notice = { tone: "info" | "success" | "error"; message: string };

const ROLE_CAN_VIEW_KDS = new Set(["owner", "org_admin", "outlet_manager", "kitchen", "bar"]);
const ROLE_CAN_VIEW_HQ = new Set(["owner", "org_admin", "finance", "outlet_manager"]);

/**
 * Browser fetch rejects with TypeError when it cannot reach the origin, but a
 * reverse proxy in front of the app can instead answer 502/503/504. Both mean
 * the terminal is cut off from the server and must show offline mode rather
 * than a misleading "online" badge over a cached menu.
 */
function isServerUnavailable(cause: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (cause instanceof TypeError) return true;
  return cause instanceof ApiError && [502, 503, 504].includes(cause.status ?? 0);
}

function productQuantity(cart: CartLine[], productId: string): number {
  return cart.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0);
}

export function PosTerminal() {
  const [bootstrap, setBootstrap] = useState<PosBootstrap | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [orders, setOrders] = useState<QueuedOrder[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [receipt, setReceipt] = useState<QueuedOrder | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<"dine-in" | "take-away">("dine-in");
  const [tableLabel, setTableLabel] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [tenderInput, setTenderInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");

  const outletIdRef = useRef<string | null>(null);
  const syncLockRef = useRef(false);
  const bootstrapSeqRef = useRef(0);

  const runSync = useCallback(async (manual = false) => {
    if (syncLockRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (manual) {
        setNotice({ tone: "error", message: "This device is offline. The queue will sync when the connection returns." });
      }
      return;
    }
    syncLockRef.current = true;
    setSyncing(true);
    try {
      const summary = await syncQueuedOrders();
      const nextOrders = await listOrders();
      setOrders(nextOrders);
      setLastSyncAt(await getLastSyncAt());
      setReceipt((current) =>
        current ? (nextOrders.find((order) => order.clientOrderId === current.clientOrderId) ?? current) : null,
      );

      if (summary.authRequired) {
        setAuthExpired(true);
        setNotice({
          tone: "error",
          message: "The server rejected the session. Sign in again to confirm queued sales.",
        });
      } else if (summary.networkError) {
        setOffline(true);
        if (manual) {
          setNotice({ tone: "error", message: "The server could not be reached. The queue is safe on this device." });
        }
      } else if (summary.conflicts > 0) {
        setNotice({
          tone: "error",
          message: `${summary.conflicts} order${summary.conflicts === 1 ? "" : "s"} hit a price change and need review in the sync queue.`,
        });
      } else if (summary.failed > 0) {
        setNotice({
          tone: "error",
          message: `${summary.failed} order${summary.failed === 1 ? "" : "s"} were rejected by the server. Open the sync queue for details.`,
        });
      } else if (summary.synced > 0) {
        setNotice({
          tone: "success",
          message: `${summary.synced} order${summary.synced === 1 ? "" : "s"} confirmed by the server.`,
        });
      } else if (manual) {
        setNotice({ tone: "info", message: "Queue checked. Nothing new to confirm." });
      }
    } catch (cause) {
      setNotice({ tone: "error", message: `Sync failed: ${errorMessage(cause)}` });
    } finally {
      syncLockRef.current = false;
      setSyncing(false);
    }
  }, []);

  const loadBootstrap = useCallback(async (requestedOutletId?: string, background = false): Promise<boolean> => {
    const sequence = ++bootstrapSeqRef.current;
    if (!background) setLoading(true);
    setError(null);

    try {
      const suffix = requestedOutletId ? `?outletId=${encodeURIComponent(requestedOutletId)}` : "";
      const data = await apiRequest<PosBootstrap>(`/api/pos/bootstrap${suffix}`);
      if (sequence !== bootstrapSeqRef.current) return false;
      setBootstrap(data);
      setCachedAt(null);
      setAuthExpired(false);
      setOffline(false);
      outletIdRef.current = data.catalog.outlet.id;
      try {
        await cacheBootstrap(data);
        await setLastOutletId(data.catalog.outlet.id);
      } catch {
        setNotice({
          tone: "error",
          message: "The menu could not be cached for offline use. Check browser storage permissions.",
        });
      }
      return true;
    } catch (cause) {
      if (sequence !== bootstrapSeqRef.current) return false;
      const unauthorized = cause instanceof ApiError && cause.status === 401;
      if (unauthorized) setAuthExpired(true);
      if (isServerUnavailable(cause)) {
        setOffline(true);
      } else if (!unauthorized) {
        setError(errorMessage(cause));
      }

      const candidate =
        requestedOutletId ?? outletIdRef.current ?? (await getLastOutletId());
      if (candidate) {
        try {
          const cached = await getCachedBootstrap(candidate);
          if (cached) {
            setBootstrap(cached.data);
            setCachedAt(cached.cachedAt);
            outletIdRef.current = cached.data.catalog.outlet.id;
            return true;
          }
        } catch {
          // IndexedDB unavailable; fall through to the visible error state.
        }
      }
      return false;
    } finally {
      if (sequence === bootstrapSeqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    async function init() {
      try {
        const [lastOutlet, storedOrders, storedSync] = await Promise.all([
          getLastOutletId(),
          listOrders(),
          getLastSyncAt(),
        ]);
        if (!alive) return;
        outletIdRef.current = lastOutlet;
        setOrders(storedOrders);
        setLastSyncAt(storedSync);
      } catch {
        if (!alive) return;
        setNotice({
          tone: "error",
          message: "Durable device storage is unavailable in this browser. Do not sell offline.",
        });
      }

      const ready = await loadBootstrap(outletIdRef.current ?? undefined);
      if (!alive) return;
      if (ready && navigator.onLine) void runSync();
      void pruneSyncedOrders().catch(() => undefined);
    }

    void init();
    return () => {
      alive = false;
    };
  }, [loadBootstrap, runSync]);

  useEffect(() => {
    const serviceWorkerEnabled =
      process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "true";
    if (serviceWorkerEnabled && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    function handleOnline() {
      setOffline(false);
      setNotice({ tone: "info", message: "Connection restored. Refreshing the menu and queue…" });
      void loadBootstrap(outletIdRef.current ?? undefined, true);
      void runSync();
    }
    function handleOffline() {
      setOffline(true);
      setNotice({
        tone: "error",
        message: "Connection lost. Cash sales will be saved on this device and synced later.",
      });
    }

    setOffline(!navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loadBootstrap, runSync]);

  useEffect(() => {
    if (offline) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void runSync();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [offline, runSync]);

  const catalog = bootstrap?.catalog ?? null;
  const canDiscount = bootstrap?.canDiscount ?? false;
  const pricing = catalog
    ? { taxBps: catalog.outlet.taxBps, serviceChargeBps: catalog.outlet.serviceChargeBps }
    : { taxBps: 0, serviceChargeBps: 0 };

  const subtotalMinor = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0),
    [cart],
  );
  const requestedDiscount = canDiscount ? (parseRupiahInput(discountInput) ?? 0) : 0;
  const discountMinor = Math.min(requestedDiscount, subtotalMinor);
  const totals = useMemo(
    () => calculateTotals({ subtotalMinor, discountMinor, pricing }),
    [subtotalMinor, discountMinor, pricing],
  );
  const tenderedMinor = parseRupiahInput(tenderInput) ?? 0;
  const changeMinor = tenderedMinor - totals.totalMinor;

  const unresolved = orders.filter(
    (order) => order.status === "pending" || order.status === "syncing" || order.status === "conflict" || order.status === "failed",
  );
  const pendingCount = orders.filter(
    (order) => order.status === "pending" || order.status === "syncing",
  ).length;
  const conflictCount = orders.filter(
    (order) => order.status === "conflict" || order.status === "failed",
  ).length;

  const categories = catalog?.categories ?? [];
  const filteredProducts = useMemo(() => {
    if (!catalog) return [];
    const needle = query.trim().toLowerCase();
    return catalog.products.filter((product) => {
      if (categoryId !== "all" && product.categoryId !== categoryId) return false;
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        product.categoryName.toLowerCase().includes(needle)
      );
    });
  }, [catalog, categoryId, query]);

  function addProduct(productId: string) {
    if (!catalog) return;
    const product = catalog.products.find((item) => item.id === productId);
    if (!product) return;
    setFormError(null);
    setCart((current) => {
      const existing = current.find((line) => line.productId === productId);
      if (existing) {
        if (existing.quantity >= 99) return current;
        return current.map((line) =>
          line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          unitPriceMinor: product.priceMinor,
          quantity: 1,
          note: "",
          station: product.station,
        },
      ];
    });
  }

  function setQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((current) => current.filter((line) => line.productId !== productId));
      return;
    }
    setCart((current) =>
      current.map((line) =>
        line.productId === productId ? { ...line, quantity: Math.min(99, quantity) } : line,
      ),
    );
  }

  function setLineNote(productId: string, note: string) {
    setCart((current) =>
      current.map((line) =>
        line.productId === productId ? { ...line, note: note.slice(0, 200) } : line,
      ),
    );
  }

  function clearCart() {
    setCart([]);
    setTenderInput("");
    setDiscountInput("");
    setDiscountReason("");
    setFormError(null);
  }

  async function switchOutlet(nextOutletId: string) {
    if (!bootstrap || nextOutletId === bootstrap.catalog.outlet.id) return;
    if (cart.length > 0) {
      setNotice({ tone: "error", message: "Clear or complete the current cart before switching outlets." });
      return;
    }
    const previous = outletIdRef.current;
    outletIdRef.current = nextOutletId;
    const ready = await loadBootstrap(nextOutletId);
    if (!ready) {
      outletIdRef.current = previous;
      if (previous) await loadBootstrap(previous, true);
    }
  }

  async function completeSale() {
    if (!bootstrap || !catalog || cart.length === 0 || saveBusy) return;
    setFormError(null);

    if (orderType === "dine-in" && !tableLabel.trim()) {
      setFormError("Enter a table label for dine-in orders.");
      return;
    }
    if (discountMinor > 0 && discountReason.trim().length < 3) {
      setFormError("Enter a short discount reason (at least 3 characters).");
      return;
    }
    if (tenderedMinor < totals.totalMinor) {
      setFormError("Cash received is less than the order total.");
      return;
    }

    setSaveBusy(true);
    const now = new Date();
    const order: QueuedOrder = {
      clientOrderId: newClientOrderId(),
      outletId: catalog.outlet.id,
      orderType,
      ...(tableLabel.trim() ? { tableLabel: tableLabel.trim() } : {}),
      lines: cart.map((line) => ({
        productId: line.productId,
        name: line.name,
        unitPriceMinor: line.unitPriceMinor,
        quantity: line.quantity,
        note: line.note.trim(),
      })),
      discountMinor,
      ...(discountMinor > 0 ? { discountReason: discountReason.trim() } : {}),
      expectedTotalMinor: totals.totalMinor,
      catalogVersion: catalog.catalogVersion,
      occurredAt: now.toISOString(),
      payment: { method: "cash", tenderedMinor },
      localNumber: makeLocalNumber(now),
      localTotalMinor: totals.totalMinor,
      status: "pending",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      attempts: 0,
    };

    try {
      // Durable write happens before the UI acknowledges the sale.
      await enqueueOrder(order);
    } catch (cause) {
      setFormError(
        `This sale could not be saved on the device. Do not take payment. ${errorMessage(cause)}`,
      );
      setSaveBusy(false);
      return;
    }

    try {
      const nextOrders = await listOrders();
      setOrders(nextOrders);
    } catch {
      setOrders((current) => [...current, order]);
    }
    setReceipt(order);
    setCart([]);
    setTenderInput("");
    setDiscountInput("");
    setDiscountReason("");
    setTableLabel("");
    setMobileCartOpen(false);
    setFormError(null);
    setSaveBusy(false);
    void runSync();

    if (!navigator.onLine) {
      setOffline(true);
      setNotice({
        tone: "info",
        message: "Sale saved on this device. It will be confirmed by the server when the connection returns.",
      });
    }
  }

  async function discardQueuedOrder(clientOrderId: string) {
    try {
      await deleteOrder(clientOrderId);
      const nextOrders = await listOrders();
      setOrders(nextOrders);
      setReceipt((current) => (current?.clientOrderId === clientOrderId ? null : current));
    } catch (cause) {
      setNotice({ tone: "error", message: `Could not discard the local record: ${errorMessage(cause)}` });
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ivory px-4">
        <div className="text-center">
          <Wordmark />
          <p className="mt-5 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted">
            <span className="h-dot h-pulse" data-state="offline" aria-hidden="true" />
            Opening the terminal
          </p>
          <p className="mt-2 text-xs font-semibold text-muted">Checking session, catalog, and local queue…</p>
        </div>
      </div>
    );
  }

  if (!bootstrap || !catalog) {
    return (
      <div className="min-h-dvh bg-ivory">
        <header className="border-b-2 border-ink bg-paper px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <Wordmark />
            <Link href="/" className="text-xs font-bold text-muted">Public site</Link>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-16">
          <div className="h-card h-card-pad">
            <p className="h-label">POS terminal / locked</p>
            <h1 className="h-title mt-2 text-[34px]">Sign in to open the terminal.</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The terminal loads no menu or order data until the server verifies a staff session.
              After the first successful load, the menu and cash queue remain available offline on
              this device.
            </p>

            {error ? (
              <div className="h-error mt-4" role="alert">
                <WarningCircle size={18} weight="fill" className="mt-0.5 flex-none" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            {authExpired ? (
              <p className="mt-3 rounded-[10px] border-2 border-brand-red bg-red-100 p-3 text-[12px] font-bold text-brand-red">
                The session expired and this device has no cached menu yet. Sign in online once to
                cache it.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/login" className="h-btn h-btn-primary">
                Staff sign in
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link href="/" className="h-btn">Back to public site</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const canViewKds = ROLE_CAN_VIEW_KDS.has(bootstrap.actor.role);
  const canViewHq = ROLE_CAN_VIEW_HQ.has(bootstrap.actor.role);
  const productCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const quickTenders = Array.from(
    new Set([totals.totalMinor, 50_000, 100_000, 150_000, 200_000]),
  )
    .filter((value) => value >= totals.totalMinor && value > 0)
    .slice(0, 4);

  return (
    <div className="min-h-dvh bg-ivory md:flex md:h-dvh md:flex-col md:overflow-hidden">
      <header className="sticky top-0 z-30 shrink-0 border-b border-ink/20 bg-white lg:static">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2">
            <Wordmark />
            <span className="h-badge h-badge-orange">POS</span>
          </div>

          {bootstrap.outlets.length > 1 ? (
            <label className="relative ml-1 inline-flex items-center">
              <span className="sr-only">Outlet</span>
              <select
                value={catalog.outlet.id}
                onChange={(event) => void switchOutlet(event.target.value)}
                disabled={cart.length > 0}
                className="h-select min-h-9 w-auto appearance-none py-1.5 pl-3 pr-8 text-[12px] font-extrabold"
                title={cart.length > 0 ? "Clear the cart to switch outlets" : "Switch outlet"}
              >
                {bootstrap.outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.code} · {outlet.name}
                  </option>
                ))}
              </select>
              <CaretDown size={13} className="pointer-events-none absolute right-2" aria-hidden="true" />
            </label>
          ) : (
            <span className="h-badge">{catalog.outlet.code} · {catalog.outlet.name}</span>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex min-h-9 items-center gap-1.5 border px-2.5 text-[10px] font-black uppercase tracking-wide ${
                offline ? "border-orange bg-orange text-ink" : "border-brand-green/30 bg-green-100 text-brand-green"
              }`}
              role="status"
              aria-live="polite"
            >
              {offline ? <WifiSlash size={14} aria-hidden="true" /> : <WifiHigh size={14} aria-hidden="true" />}
              {offline ? "Offline" : "Online"}
            </span>

            <button
              type="button"
              onClick={() => setQueueOpen(true)}
              className={`h-btn h-btn-sm ${conflictCount > 0 ? "h-btn-danger" : ""}`}
              aria-label={`Open sync queue, ${unresolved.length} unresolved`}
            >
              <ListChecks size={15} aria-hidden="true" />
              Queue
              <span className="h-mono rounded-full border border-ink/30 px-1.5 text-[10px]">{unresolved.length}</span>
            </button>

            <button
              type="button"
              onClick={() => void runSync(true)}
              disabled={syncing}
              className="h-btn h-btn-sm"
              aria-label="Sync queued orders"
            >
              <ArrowClockwise size={15} className={syncing ? "h-pulse" : ""} aria-hidden="true" />
              <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync"}</span>
            </button>

            {canViewKds ? (
              <Link href="/kds" className="h-btn h-btn-sm" aria-label="Open kitchen display">
                <ChefHat size={15} aria-hidden="true" />
                <span className="hidden xl:inline">KDS</span>
              </Link>
            ) : null}
            {canViewHq ? (
              <Link href="/hq" className="h-btn h-btn-sm" aria-label="Open HQ">
                <SquaresFour size={15} aria-hidden="true" />
                <span className="hidden xl:inline">HQ</span>
              </Link>
            ) : null}
            <LogoutButton compact />
          </div>
        </div>

        {offline ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-orange/30 bg-orange/10 px-3 py-2 text-[11px] font-bold text-ink sm:px-4">
            <span className="inline-flex items-center gap-1.5">
              <CloudArrowUp size={16} weight="bold" aria-hidden="true" />
              Offline mode. Cash only.
            </span>
            <span>{pendingCount} sale{pendingCount === 1 ? "" : "s"} waiting on this device.</span>
            <span className="opacity-70">Menu cached {cachedAt ? formatTime(cachedAt) : "earlier"}.</span>
          </div>
        ) : null}

        {authExpired ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-brand-red/20 bg-red-100 px-3 py-2 text-[11px] font-bold text-brand-red sm:px-4">
            <span className="inline-flex items-center gap-1.5">
              <WarningCircle size={16} weight="fill" aria-hidden="true" />
              Session expired. Offline selling continues; sync requires sign-in.
            </span>
            <Link href="/login" className="underline">Sign in again</Link>
            <span className="opacity-70">The local queue is preserved.</span>
          </div>
        ) : null}

        {cachedAt && !offline ? (
          <div className="border-t border-ink/15 bg-ivory px-3 py-1.5 text-[10px] font-bold text-muted sm:px-4">
            Using a cached menu from {formatTime(cachedAt)}. Prices are revalidated by the server on
            every sync.
          </div>
        ) : null}

        {notice ? (
          <div className="flex items-center justify-between gap-2 border-t border-ink/15 bg-white px-3 py-1.5 text-[11px] font-bold sm:px-4">
            <span
              className={
                notice.tone === "success"
                  ? "text-brand-green"
                  : notice.tone === "error"
                    ? "text-brand-red"
                    : "text-muted"
              }
              role="status"
              aria-live="polite"
            >
              {notice.message}
            </span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-[10px] font-black uppercase tracking-wide text-muted"
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </header>

      <div className="md:grid md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,1fr)_320px]">
        <section
          className={`min-w-0 p-3 sm:p-4 md:h-full md:overflow-y-auto ${cart.length > 0 ? "pb-20 md:pb-4" : ""}`}
          aria-label="Menu"
        >
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlass size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <label htmlFor="menu-search" className="sr-only">Search menu</label>
              <input
                id="menu-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-input pl-10"
                placeholder="Search the menu…"
                type="search"
              />
            </div>
            <p className="h-label whitespace-nowrap text-right">
              {filteredProducts.length} items
            </p>
          </div>

          <div className="h-scroll mb-3 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Menu categories">
            <button
              type="button"
              onClick={() => setCategoryId("all")}
              data-active={categoryId === "all"}
              className="h-chip flex-none"
            >
              All
              <span className="h-mono text-[10px] opacity-60">{catalog.products.length}</span>
            </button>
            {categories.map((category) => {
              const count = catalog.products.filter((product) => product.categoryId === category.id).length;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryId(category.id)}
                  data-active={categoryId === category.id}
                  className="h-chip flex-none"
                >
                  {category.name}
                  <span className="h-mono text-[10px] opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          {filteredProducts.length === 0 ? (
            <div className="h-card grid place-items-center px-4 py-16 text-center">
              <p className="text-sm font-extrabold">No menu items match.</p>
              <p className="mt-1 text-xs text-muted">Try another category or clear the search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredProducts.map((product) => {
                const inCart = productQuantity(cart, product.id);
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product.id)}
                    className="group flex min-h-[112px] flex-col justify-between border border-ink/20 bg-white p-3 text-left transition-colors hover:border-ink hover:bg-orange/5"
                  >
                    <span className="flex items-start justify-between gap-1">
                      <span className="inline-flex min-h-5 items-center gap-1 rounded-full border border-ink/40 px-1.5 text-[8px] font-black uppercase tracking-wide text-muted">
                        {product.station === "bar" ? <Coffee size={10} aria-hidden="true" /> : <ChefHat size={10} aria-hidden="true" />}
                        {product.station}
                      </span>
                      {inCart > 0 ? (
                        <span className="h-mono grid h-5 min-w-5 place-items-center rounded-full bg-brand-blue px-1 text-[10px] font-black text-white">
                          {inCart}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2 block text-[13px] font-extrabold leading-tight">{product.name}</span>
                    <span className="h-num mt-1 block text-[12px] font-extrabold">
                      {formatMoney(product.priceMinor)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <p className="mt-4 flex items-center gap-1.5 text-[10px] font-semibold text-muted">
            <Receipt size={12} aria-hidden="true" />
            Prices shown are the cached menu. The server re-prices every order before accepting it.
          </p>
        </section>

        <aside
          id="pos-cart"
          className={`border-t border-ink/20 bg-white ${
            mobileCartOpen
              ? "fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto md:static md:block md:h-full md:max-h-none md:overflow-y-auto md:border-l md:border-t-0"
              : "hidden md:block md:h-full md:overflow-y-auto md:border-l md:border-t-0"
          }`}
          aria-label="Current order"
        >
          <div className="sticky top-0 z-10 border-b-2 border-ink bg-paper px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="h-label">Current order</p>
                <p className="text-[13px] font-extrabold">
                  {productCount} item{productCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <ShoppingCart size={18} aria-hidden="true" />
                {cart.length > 0 ? (
                  <button type="button" onClick={clearCart} className="h-btn h-btn-sm h-btn-ghost text-brand-red" aria-label="Clear cart">
                    <Trash size={14} aria-hidden="true" />
                  </button>
                ) : null}
                {mobileCartOpen ? (
                  <button
                    type="button"
                    onClick={() => setMobileCartOpen(false)}
                    className="h-btn h-btn-sm h-btn-ghost"
                  >
                    Back to menu
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="p-3">
            <div className="mb-3 grid grid-cols-2 gap-1.5" role="group" aria-label="Order type">
              <button
                type="button"
                onClick={() => setOrderType("dine-in")}
                aria-pressed={orderType === "dine-in"}
                className="h-btn h-btn-sm"
                style={{
                  background: orderType === "dine-in" ? "#121212" : "transparent",
                  color: orderType === "dine-in" ? "#FFF5D5" : "#121212",
                }}
              >
                Dine in
              </button>
              <button
                type="button"
                onClick={() => setOrderType("take-away")}
                aria-pressed={orderType === "take-away"}
                className="h-btn h-btn-sm"
                style={{
                  background: orderType === "take-away" ? "#121212" : "transparent",
                  color: orderType === "take-away" ? "#FFF5D5" : "#121212",
                }}
              >
                Take away
              </button>
            </div>

            {orderType === "dine-in" ? (
              <div className="h-field mb-3">
                <label htmlFor="table-label" className="text-[11px] font-extrabold">Table</label>
                <input
                  id="table-label"
                  value={tableLabel}
                  onChange={(event) => setTableLabel(event.target.value.slice(0, 32))}
                  className="h-input"
                  placeholder="e.g. 07"
                  disabled={cart.length === 0}
                />
              </div>
            ) : null}

            {cart.length === 0 ? (
              <div className="grid place-items-center border-2 border-dashed border-ink/25 px-3 py-10 text-center" style={{ borderRadius: 10 }}>
                <ShoppingCart size={28} weight="light" aria-hidden="true" />
                <p className="mt-2 text-[12px] font-extrabold">The cart is empty.</p>
                <p className="mt-1 text-[10px] font-semibold text-muted">
                  Tap a menu tile to start a cash order.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {cart.map((line) => (
                  <li key={line.productId} className="border-b border-ink/15 bg-ivory/50 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[12px] font-extrabold leading-tight">{line.name}</p>
                        <p className="h-num text-[10px] font-semibold text-muted">
                          {formatMoney(line.unitPriceMinor)} each
                        </p>
                      </div>
                      <p className="h-num flex-none text-[12px] font-extrabold">
                        {formatMoney(line.unitPriceMinor * line.quantity)}
                      </p>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
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
                      <button
                        type="button"
                        onClick={() => setQuantity(line.productId, 0)}
                        className="ml-auto grid h-8 w-8 place-items-center border border-ink/20 bg-white text-brand-red"
                        aria-label={`Remove ${line.name} from cart`}
                      >
                        <Trash size={13} aria-hidden="true" />
                      </button>
                    </div>

                    <label htmlFor={`note-${line.productId}`} className="sr-only">Note for {line.name}</label>
                    <input
                      id={`note-${line.productId}`}
                      value={line.note}
                      onChange={(event) => setLineNote(line.productId, event.target.value)}
                      className="h-input mt-1.5 min-h-8 py-1 text-[11px]"
                      placeholder="Kitchen note (optional)"
                      maxLength={200}
                    />
                  </li>
                ))}
              </ul>
            )}

            <dl className="mt-3 space-y-1 border-t-2 border-ink pt-2 text-[12px]">
              <div className="flex justify-between">
                <dt className="font-semibold text-muted">Subtotal</dt>
                <dd className="h-num font-bold">{formatMoney(totals.subtotalMinor)}</dd>
              </div>
              {discountMinor > 0 ? (
                <div className="flex justify-between text-brand-red">
                  <dt className="font-semibold">Discount</dt>
                  <dd className="h-num font-bold">−{formatMoney(discountMinor)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="font-semibold text-muted">Tax · {formatBps(pricing.taxBps)}</dt>
                <dd className="h-num font-bold">{formatMoney(totals.taxMinor)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-semibold text-muted">Service · {formatBps(pricing.serviceChargeBps)}</dt>
                <dd className="h-num font-bold">{formatMoney(totals.serviceChargeMinor)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t-2 border-ink pt-2">
                <dt className="text-[13px] font-black">Total</dt>
                <dd className="h-num text-[20px] font-black">{formatMoney(totals.totalMinor)}</dd>
              </div>
            </dl>

            {canDiscount ? (
              <div className="mt-3 border-t border-ink/20 pt-3">
                <p className="h-label mb-1.5">Discount</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="h-field">
                    <label htmlFor="discount-amount" className="sr-only">Discount amount in rupiah</label>
                    <input
                      id="discount-amount"
                      className="h-input min-h-9 py-1.5 text-[12px]"
                      inputMode="numeric"
                      value={discountInput}
                      onChange={(event) => setDiscountInput(event.target.value)}
                      placeholder="0"
                      disabled={cart.length === 0}
                    />
                  </div>
                  <div className="h-field">
                    <label htmlFor="discount-reason" className="sr-only">Discount reason</label>
                    <input
                      id="discount-reason"
                      className="h-input min-h-9 py-1.5 text-[12px]"
                      value={discountReason}
                      onChange={(event) => setDiscountReason(event.target.value.slice(0, 200))}
                      placeholder="Reason"
                      disabled={discountMinor === 0}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-3 border-t border-ink/20 bg-ivory/60 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="tender-amount" className="text-[11px] font-extrabold">Cash received</label>
                {tenderedMinor > 0 ? (
                  <span className={`h-mono text-[11px] font-black ${changeMinor < 0 ? "text-brand-red" : "text-brand-green"}`}>
                    Change {formatMoney(Math.max(0, changeMinor))}
                  </span>
                ) : null}
              </div>
              <input
                id="tender-amount"
                className="h-input mt-1.5 min-h-11 text-[17px] font-black"
                inputMode="numeric"
                value={tenderInput}
                onChange={(event) => setTenderInput(event.target.value)}
                placeholder={formatMoney(totals.totalMinor)}
                disabled={cart.length === 0}
              />
              {quickTenders.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {quickTenders.map((value, index) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTenderInput(String(value))}
                      className="border border-ink/20 bg-white px-2 py-1 text-[10px] font-extrabold"
                    >
                      {index === 0 ? "Exact" : formatMoney(value)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {formError ? (
              <div className="h-error mt-2 text-[11px]" role="alert">
                <WarningCircle size={16} weight="fill" className="mt-0.5 flex-none" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void completeSale()}
              disabled={
                cart.length === 0 ||
                saveBusy ||
                tenderedMinor < totals.totalMinor ||
                (discountMinor > 0 && discountReason.trim().length < 3)
              }
              className="h-btn h-btn-primary mt-3 w-full text-[14px]"
            >
              <Receipt size={18} weight="bold" aria-hidden="true" />
              {saveBusy ? "Saving on device…" : `Charge cash · ${formatMoney(totals.totalMinor)}`}
            </button>

            <p className="mt-2 text-center text-[9px] font-semibold leading-relaxed text-muted">
              Cash only in V4.1. QRIS and card adapters are not integrated. A sale is not confirmed
              until the server accepts it.
            </p>
          </div>
        </aside>
      </div>

      {cart.length > 0 && !mobileCartOpen ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/20 bg-white px-3 pt-2 h-safe-bottom md:hidden">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            aria-controls="pos-cart"
            className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
          >
            <span className="inline-flex items-center gap-2 text-[12px] font-extrabold">
              <ShoppingCart size={17} aria-hidden="true" />
              View order · {productCount} item{productCount === 1 ? "" : "s"}
            </span>
            <span className="h-num text-[13px] font-black">{formatMoney(totals.totalMinor)}</span>
          </button>
        </div>
      ) : null}

      {receipt ? (
        <PosReceipt
          order={receipt}
          onClose={() => setReceipt(null)}
          onOpenQueue={() => {
            setReceipt(null);
            setQueueOpen(true);
          }}
        />
      ) : null}

      {queueOpen ? (
        <PosQueue
          orders={orders}
          online={!offline}
          authExpired={authExpired}
          syncing={syncing}
          onClose={() => setQueueOpen(false)}
          onSync={() => void runSync(true)}
          onDiscard={discardQueuedOrder}
        />
      ) : null}

      {lastSyncAt ? (
        <p className="hidden" aria-hidden="true">Last sync {formatTime(lastSyncAt)}</p>
      ) : null}
    </div>
  );
}

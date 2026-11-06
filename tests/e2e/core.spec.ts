import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  getDemoCredentials,
  type DemoCredential,
} from "../../src/modules/identity/demo-accounts";
import type { QueuedOrder } from "../../src/lib/pos/types";

interface LoginResponse {
  ok: boolean;
  data: { actor: { role: string } };
}

interface ApiResponse<T> {
  ok: boolean;
  data: T;
}

interface HqOverview {
  recentOrders: { orderNumber: string; status: string; paymentStatus: string }[];
  kpis: { openTickets: number };
}

const demoCredentials = getDemoCredentials();
const ownerCredential = demoCredentials.find((credential) => credential.label === "Owner");
const cashierCredential = demoCredentials.find((credential) => credential.label === "Cashier");
const kitchenCredential = demoCredentials.find((credential) => credential.label === "Kitchen");
const barCredential = demoCredentials.find((credential) => credential.label === "Bar");

if (!ownerCredential || !cashierCredential || !kitchenCredential || !barCredential) {
  throw new Error("The isolated E2E seed must include owner, cashier, kitchen, and bar accounts.");
}

async function signIn(
  page: Page,
  credential: DemoCredential,
  destination: "/hq" | "/pos" | "/kds",
): Promise<string> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to your shift." })).toBeVisible();
  const loginResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/login",
  );
  await page.getByLabel("Email", { exact: true }).fill(credential.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(credential.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  const response = await loginResponsePromise;
  expect(response.status()).toBe(200);
  const result = (await response.json()) as LoginResponse;
  expect(result.ok).toBe(true);
  expect(result.data.actor.role).toBe(
    credential.label === "Owner"
      ? "owner"
      : credential.label === "Cashier"
        ? "cashier"
        : credential.label.toLowerCase(),
  );
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  return result.data.actor.role;
}

async function storedOrders(page: Page): Promise<QueuedOrder[]> {
  return page.evaluate(
    () =>
      new Promise<QueuedOrder[]>((resolve, reject) => {
        const request = indexedDB.open("hansan-pos", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const read = database.transaction("orders", "readonly").objectStore("orders").getAll();
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            database.close();
            resolve(read.result as QueuedOrder[]);
          };
        };
      }),
  );
}

async function replayOrder(page: Page, order: QueuedOrder) {
  return page.evaluate(async (queuedOrder) => {
    const csrf = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("hansan_csrf="))
      ?.split("=")[1];
    if (!csrf) throw new Error("The session CSRF cookie is missing.");

    const response = await fetch("/api/pos/sync", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({
        outletId: queuedOrder.outletId,
        orders: [
          {
            clientOrderId: queuedOrder.clientOrderId,
            orderType: queuedOrder.orderType,
            ...(queuedOrder.tableLabel ? { tableLabel: queuedOrder.tableLabel } : {}),
            lines: queuedOrder.lines.map(({ productId, quantity, note }) => ({
              productId,
              quantity,
              note,
            })),
            discountMinor: queuedOrder.discountMinor,
            ...(queuedOrder.discountReason ? { discountReason: queuedOrder.discountReason } : {}),
            expectedTotalMinor: queuedOrder.expectedTotalMinor,
            catalogVersion: queuedOrder.catalogVersion,
            occurredAt: queuedOrder.occurredAt,
            payment: queuedOrder.payment,
          },
        ],
      }),
    });
    return { status: response.status, body: await response.json() };
  }, order);
}

async function finishTicket(page: Page, orderNumber: string): Promise<void> {
  const ticket = page.getByRole("article", { name: `Ticket ${orderNumber}` });
  await expect(ticket).toBeVisible();
  for (const [current, next] of [
    ["Accept", "Start cooking"],
    ["Start cooking", "Mark ready"],
    ["Mark ready", "Complete"],
  ]) {
    await ticket.getByRole("button", { name: current }).click();
    if (next !== "Complete") {
      await expect(ticket.getByRole("button", { name: next })).toBeVisible();
    }
  }
  await ticket.getByRole("button", { name: "Complete" }).click();
  await expect(ticket).toHaveCount(0);
}

test("auth, POS durability and replay, station KDS, and public pickup ordering", async ({
  browser,
}) => {
  const contexts: BrowserContext[] = [];
  const makeContext = async () => {
    const context = await browser.newContext();
    contexts.push(context);
    return context;
  };

  try {
    const ownerContext = await makeContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/login");
    await expect(ownerPage.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(ownerPage.getByRole("textbox", { name: "Password", exact: true })).toBeVisible();
    await expect(ownerPage.getByText(/owner@demo\.hansan\.id|demo credentials|select a role/i)).toHaveCount(0);
    expect(await signIn(ownerPage, ownerCredential, "/hq")).toBe("owner");

    await ownerPage.goto("/hq/staff");
    await expect(ownerPage.getByRole("heading", { name: "Access follows the role." })).toBeVisible();
    await expect(ownerPage.getByText(ownerCredential.email)).toBeVisible();
    await expect(ownerPage.getByText(cashierCredential.email)).toBeVisible();

    const cashierContext = await makeContext();
    const cashierPage = await cashierContext.newPage();
    expect(await signIn(cashierPage, cashierCredential, "/pos")).toBe("cashier");
    const forbiddenOverview = await cashierContext.request.get("/api/hq/overview");
    expect(forbiddenOverview.status()).toBe(403);
    await cashierPage.goto("/hq");
    await expect(cashierPage).toHaveURL(/\/pos$/);

    const cashierHome = await cashierContext.newPage();
    await cashierHome.goto("/pos");
    await expect(cashierHome.getByRole("region", { name: "Menu" })).toBeVisible();
    await cashierHome.getByRole("button", { name: "Take away", exact: true }).click();
    await cashierHome.getByRole("region", { name: "Menu" }).getByRole("button", { name: /Espresso/ }).click();
    await cashierHome
      .getByRole("region", { name: "Menu" })
      .getByRole("button", { name: /Nasi Goreng Kampung/ })
      .click();
    await cashierHome.getByLabel("Cash received").fill("200000");
    await cashierHome.getByRole("button", { name: /Charge cash/ }).click();

    await expect(cashierHome.getByRole("heading", { name: "Cash receipt" })).toBeVisible({
      timeout: 60_000,
    });
    const onlineReceipt = cashierHome.getByRole("dialog");
    await expect(onlineReceipt.getByText(/Espresso/)).toBeVisible();
    await expect(onlineReceipt.getByText(/Nasi Goreng Kampung/)).toBeVisible();
    await onlineReceipt.getByRole("button", { name: "Start next order" }).click();

    let order: QueuedOrder | undefined;
    await expect
      .poll(async () => {
        order = (await storedOrders(cashierHome)).find(
          (queuedOrder) => queuedOrder.lines.some((line) => line.name === "Espresso") &&
            queuedOrder.lines.some((line) => line.name === "Nasi Goreng Kampung"),
        );
        return order?.status;
      })
      .toBe("synced");
    if (!order?.serverOrderNumber) throw new Error("The online order was not confirmed by the server.");
    const mixedOrderNumber = order.serverOrderNumber;

    const onlineReplay = await replayOrder(cashierHome, order);
    expect(onlineReplay.status).toBe(200);
    expect(onlineReplay.body.data.results[0].order).toMatchObject({
      orderNumber: mixedOrderNumber,
      duplicate: true,
      paymentStatus: "paid",
    });

    await expect
      .poll(async () => {
        const response = await ownerContext.request.get("/api/hq/overview");
        const result = (await response.json()) as ApiResponse<HqOverview>;
        return result.data.recentOrders.find((recent) => recent.orderNumber === mixedOrderNumber);
      })
      .toMatchObject({ orderNumber: mixedOrderNumber, status: "placed", paymentStatus: "paid" });

    await cashierHome.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (navigator.serviceWorker.controller) return;
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Service worker did not control POS.")), 15_000);
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            window.clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    });
    await cashierHome.reload();
    await expect(cashierHome.getByRole("region", { name: "Menu" })).toBeVisible();

    await cashierContext.setOffline(true);
    await expect(cashierHome.getByRole("status").filter({ hasText: "Offline" })).toBeVisible();
    await cashierHome.getByRole("button", { name: "Take away", exact: true }).click();
    await cashierHome.getByRole("region", { name: "Menu" }).getByRole("button", { name: /Espresso/ }).click();
    await cashierHome.getByLabel("Cash received").fill("100000");
    await cashierHome.getByRole("button", { name: /Charge cash/ }).click();

    await expect(cashierHome.getByRole("heading", { name: "Cash receipt" })).toBeVisible({
      timeout: 60_000,
    });
    const offlineReceipt = cashierHome.getByRole("dialog");
    await expect(offlineReceipt.getByText("Saved on this device")).toBeVisible();
    await offlineReceipt.getByRole("button", { name: "Start next order" }).click();
    const offlineOrder = (await storedOrders(cashierHome)).find(
      (queuedOrder) => queuedOrder.status === "pending",
    );
    if (!offlineOrder) throw new Error("The offline cash sale was not durably queued.");
    const offlineClientOrderId = offlineOrder.clientOrderId;

    await cashierHome.reload();
    await expect(cashierHome.getByRole("region", { name: "Menu" })).toBeVisible();
    await expect
      .poll(async () =>
        (await storedOrders(cashierHome)).find(
          (queuedOrder) => queuedOrder.clientOrderId === offlineClientOrderId,
        )?.status,
      )
      .toBe("pending");
    await cashierHome.getByRole("button", { name: /Open sync queue/ }).click();
    const queue = cashierHome.getByRole("dialog", { name: "Sync ledger" });
    await expect(queue.getByText("1 waiting", { exact: true })).toBeVisible();
    await expect(queue.getByRole("button", { name: "Sync now" })).toBeDisabled();
    await cashierHome.getByRole("button", { name: "Close queue" }).click();

    await cashierContext.setOffline(false);
    await expect
      .poll(async () =>
        (await storedOrders(cashierHome)).find(
          (queuedOrder) => queuedOrder.clientOrderId === offlineClientOrderId,
        )?.status,
      )
      .toBe("synced");
    const persistedOfflineOrder = (await storedOrders(cashierHome)).find(
      (queuedOrder) => queuedOrder.clientOrderId === offlineClientOrderId,
    );
    if (!persistedOfflineOrder?.serverOrderNumber) {
      throw new Error("The offline order did not receive a server order number after reconnect.");
    }

    const offlineReplay = await replayOrder(cashierHome, persistedOfflineOrder);
    expect(offlineReplay.status).toBe(200);
    expect(offlineReplay.body.data.results[0].order).toMatchObject({
      orderNumber: persistedOfflineOrder.serverOrderNumber,
      duplicate: true,
      paymentStatus: "paid",
    });

    const kitchenContext = await makeContext();
    const kitchenPage = await kitchenContext.newPage();
    expect(await signIn(kitchenPage, kitchenCredential, "/kds")).toBe("kitchen");
    const kitchenForbidden = await kitchenContext.request.get(
      `/api/kds/tickets?station=bar&outletId=${encodeURIComponent(order.outletId)}`,
    );
    expect(kitchenForbidden.status()).toBe(403);
    const kitchenTicket = kitchenPage.getByRole("article", { name: `Ticket ${mixedOrderNumber}` });
    await expect(kitchenTicket.getByText("Nasi Goreng Kampung", { exact: true })).toBeVisible();
    await expect(kitchenPage.getByText("Espresso", { exact: true })).toHaveCount(0);
    await finishTicket(kitchenPage, mixedOrderNumber);

    const barContext = await makeContext();
    const barPage = await barContext.newPage();
    expect(await signIn(barPage, barCredential, "/kds")).toBe("bar");
    const barForbidden = await barContext.request.get(
      `/api/kds/tickets?station=kitchen&outletId=${encodeURIComponent(order.outletId)}`,
    );
    expect(barForbidden.status()).toBe(403);
    const barTicket = barPage.getByRole("article", { name: `Ticket ${mixedOrderNumber}` });
    await expect(barTicket.getByText("Espresso", { exact: true })).toBeVisible();
    await expect(barPage.getByText("Nasi Goreng Kampung", { exact: true })).toHaveCount(0);
    await finishTicket(barPage, mixedOrderNumber);

    await expect
      .poll(async () => {
        const response = await ownerContext.request.get("/api/hq/overview");
        const result = (await response.json()) as ApiResponse<HqOverview>;
        return result.data.recentOrders.find((recent) => recent.orderNumber === mixedOrderNumber)?.status;
      })
      .toBe("completed");

    const publicContext = await makeContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto("/store/demo");
    const espressoCard = publicPage
      .locator("article")
      .filter({ has: publicPage.getByRole("heading", { name: "Espresso", exact: true }) });
    await espressoCard.getByRole("button", { name: "Add" }).click();
    await publicPage.getByLabel("Your name").fill("E2E Pickup");
    await publicPage.getByLabel("Phone").fill("08123456789");
    await publicPage.getByRole("button", { name: /Place order/ }).click();
    await expect(publicPage.getByText("Order placed", { exact: true })).toBeVisible();
    await expect(
      publicPage.getByRole("complementary", { name: "Your order" }).getByText("Unpaid", { exact: true }),
    ).toBeVisible();

    const storefrontOrderNumber = (await publicPage.locator("main").innerText()).match(/MAIN-\d{4}/)?.[0];
    if (!storefrontOrderNumber) throw new Error("The public pickup confirmation omitted its order number.");
    await expect
      .poll(async () => {
        const response = await ownerContext.request.get("/api/hq/overview");
        const result = (await response.json()) as ApiResponse<HqOverview>;
        return result.data.recentOrders.find((recent) => recent.orderNumber === storefrontOrderNumber);
      })
      .toMatchObject({
        orderNumber: storefrontOrderNumber,
        status: "placed",
        paymentStatus: "unpaid",
      });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CachedBootstrap, PosBootstrap, QueuedOrder } from "./types";

/**
 * Durable device storage for the POS.
 *
 * The queue row is written before a sale is acknowledged to the operator. A
 * browser refresh, tab crash, or reboot must not lose a cash transaction.
 */

interface PosDb extends DBSchema {
  bootstrap: { key: string; value: CachedBootstrap };
  orders: {
    key: string;
    value: QueuedOrder;
    indexes: { "by-created": string };
  };
  meta: { key: string; value: string };
}

const DB_NAME = "hansan-pos";
const DB_VERSION = 1;
let handle: Promise<IDBPDatabase<PosDb>> | null = null;

function getDatabase(): Promise<IDBPDatabase<PosDb>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support durable offline storage."));
  }
  if (!handle) {
    handle = openDB<PosDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("bootstrap")) {
          db.createObjectStore("bootstrap");
        }
        if (!db.objectStoreNames.contains("orders")) {
          const store = db.createObjectStore("orders", { keyPath: "clientOrderId" });
          store.createIndex("by-created", "createdAt");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
      },
    });
  }
  return handle;
}

function bootstrapKey(outletId: string): string {
  return `outlet:${outletId}`;
}

export async function cacheBootstrap(data: PosBootstrap): Promise<void> {
  const db = await getDatabase();
  await db.put(
    "bootstrap",
    { data, cachedAt: new Date().toISOString() },
    bootstrapKey(data.catalog.outlet.id),
  );
}

export async function getCachedBootstrap(outletId: string): Promise<CachedBootstrap | null> {
  const db = await getDatabase();
  return (await db.get("bootstrap", bootstrapKey(outletId))) ?? null;
}

export async function enqueueOrder(order: QueuedOrder): Promise<void> {
  const db = await getDatabase();
  await db.add("orders", order);
}

export async function updateOrder(
  clientOrderId: string,
  patch: Partial<QueuedOrder>,
): Promise<QueuedOrder | null> {
  const db = await getDatabase();
  const existing = await db.get("orders", clientOrderId);
  if (!existing) return null;
  const next: QueuedOrder = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await db.put("orders", next);
  return next;
}

export async function deleteOrder(clientOrderId: string): Promise<void> {
  const db = await getDatabase();
  await db.delete("orders", clientOrderId);
}

export async function listOrders(): Promise<QueuedOrder[]> {
  const db = await getDatabase();
  return db.getAllFromIndex("orders", "by-created");
}

export async function getOrder(clientOrderId: string): Promise<QueuedOrder | null> {
  const db = await getDatabase();
  return (await db.get("orders", clientOrderId)) ?? null;
}

export async function setLastSyncAt(value: string): Promise<void> {
  const db = await getDatabase();
  await db.put("meta", value, "lastSyncAt");
}

export async function getLastSyncAt(): Promise<string | null> {
  const db = await getDatabase();
  return (await db.get("meta", "lastSyncAt")) ?? null;
}

export async function pruneSyncedOrders(olderThanMs = 7 * 24 * 60 * 60_000): Promise<number> {
  const db = await getDatabase();
  const cutoff = Date.now() - olderThanMs;
  const all = await db.getAll("orders");
  const stale = all.filter(
    (order) => order.status === "synced" && new Date(order.updatedAt).getTime() < cutoff,
  );
  if (stale.length === 0) return 0;
  const tx = db.transaction("orders", "readwrite");
  await Promise.all(stale.map((order) => tx.store.delete(order.clientOrderId)));
  await tx.done;
  return stale.length;
}

export async function getLastOutletId(): Promise<string | null> {
  const db = await getDatabase();
  return (await db.get("meta", "lastOutletId")) ?? null;
}

export async function setLastOutletId(outletId: string): Promise<void> {
  const db = await getDatabase();
  await db.put("meta", outletId, "lastOutletId");
}

export function newClientOrderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function makeLocalNumber(date = new Date()): string {
  const time = `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LOCAL-${time}-${suffix}`;
}

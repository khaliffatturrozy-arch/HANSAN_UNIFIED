import type { OutletCatalog } from "@/modules/ordering/catalog-types";

export interface PosActor {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  tenantId: string;
  tenantName: string;
  outletId: string;
  outletName: string;
  grantedOutletIds: string[];
}

export interface PosOutlet {
  id: string;
  name: string;
  code: string;
}

export interface PosBootstrap {
  actor: PosActor;
  catalog: OutletCatalog;
  outlets: PosOutlet[];
  canDiscount: boolean;
  demoMode: boolean;
  serverTime: string;
}

export interface CachedBootstrap {
  data: PosBootstrap;
  cachedAt: string;
}

export interface CartLine {
  productId: string;
  name: string;
  unitPriceMinor: number;
  quantity: number;
  note: string;
  station: "kitchen" | "bar";
}

export type QueuedOrderStatus = "pending" | "syncing" | "synced" | "conflict" | "failed";

export interface QueueError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface QueuedOrder {
  clientOrderId: string;
  outletId: string;
  orderType: "dine-in" | "take-away";
  tableLabel?: string;
  lines: {
    productId: string;
    name: string;
    unitPriceMinor: number;
    quantity: number;
    note: string;
  }[];
  discountMinor: number;
  discountReason?: string;
  expectedTotalMinor: number;
  catalogVersion: string;
  occurredAt: string;
  payment: { method: "cash"; tenderedMinor: number };
  localNumber: string;
  localTotalMinor: number;
  status: QueuedOrderStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastAttemptAt?: string;
  serverOrderId?: string;
  serverOrderNumber?: string;
  error?: QueueError;
}

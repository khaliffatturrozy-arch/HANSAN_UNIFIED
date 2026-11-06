import { z } from "zod";

export const orderTypeSchema = z.enum(["dine-in", "take-away", "online"]);

const noteSchema = z.string().trim().max(200).default("");

export const orderLineInputSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(99),
  note: noteSchema.optional().default(""),
});

const occurredAtSchema = z
  .string()
  .max(64)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date-time");

export const syncOrderSchema = z.object({
  clientOrderId: z.uuid(),
  orderType: orderTypeSchema,
  tableLabel: z.string().trim().max(32).optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  lines: z.array(orderLineInputSchema).min(1).max(100),
  discountMinor: z.number().int().min(0).default(0),
  discountReason: z.string().trim().min(3).max(200).optional(),
  expectedTotalMinor: z.number().int().min(0),
  catalogVersion: z.string().max(100).default(""),
  occurredAt: occurredAtSchema,
  payment: z.object({
    method: z.literal("cash"),
    tenderedMinor: z.number().int().min(0),
  }),
});

export const syncRequestSchema = z.object({
  outletId: z.uuid(),
  orders: z.array(syncOrderSchema).min(1).max(20),
});

export type SyncOrderInput = z.infer<typeof syncOrderSchema>;
export type SyncRequestInput = z.infer<typeof syncRequestSchema>;

export const publicOrderSchema = z
  .object({
    clientOrderId: z.uuid(),
    orderType: z.enum(["take-away", "dine-in"]).default("take-away"),
    tableLabel: z.string().trim().max(32).optional(),
    customerName: z.string().trim().min(2).max(120),
    customerPhone: z.string().trim().min(7).max(40),
    lines: z.array(orderLineInputSchema).min(1).max(50),
    occurredAt: occurredAtSchema,
  })
  .superRefine((input, context) => {
    if (input.orderType === "dine-in" && !input.tableLabel) {
      context.addIssue({
        code: "custom",
        path: ["tableLabel"],
        message: "A table label is required for dine-in orders",
      });
    }
    if (input.orderType === "take-away" && input.tableLabel) {
      context.addIssue({
        code: "custom",
        path: ["tableLabel"],
        message: "A table label is only valid for dine-in orders",
      });
    }
  });

export type PublicOrderInput = z.infer<typeof publicOrderSchema>;

export interface SyncedOrder {
  clientOrderId: string;
  orderId: string;
  orderNumber: string;
  status: "placed" | "completed" | "cancelled";
  paymentStatus: "unpaid" | "paid" | "refunded";
  totalMinor: number;
  changeMinor: number;
  duplicate: boolean;
}

export interface OrderErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type SyncOrderResult =
  | { clientOrderId: string; ok: true; order: SyncedOrder }
  | { clientOrderId: string; ok: false; error: OrderErrorPayload };

export interface PublicOrderResult {
  orderId: string;
  orderNumber: string;
  totalMinor: number;
  status: "placed";
  paymentStatus: "unpaid";
}

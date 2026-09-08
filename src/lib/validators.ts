import { z } from "zod";

export const scanSchema = z.object({
  query: z.string().trim().min(1).max(160),
});

export const packSchema = z.object({
  deviceId: z.string().trim().min(1).max(160),
  userAgent: z.string().trim().max(500).optional(),
});

export const productSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(240),
  asin: z.string().trim().max(32).optional(),
  barcode: z.string().trim().max(160).optional(),
  locationId: z.uuid().optional().or(z.literal("")),
});

export const locationSchema = z.object({
  warehouseId: z.uuid(),
  code: z.string().trim().min(1).max(80),
  rack: z.string().trim().max(80).optional(),
  shelf: z.string().trim().max(80).optional(),
  bin: z.string().trim().max(80).optional(),
});

export const workerSchema = z.object({
  email: z.email(),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(2).max(100),
  role: z.enum(["worker", "admin", "super_admin"]),
});

export const workerIdSchema = z.uuid();
export const appRoleSchema = z.enum(["worker", "admin", "super_admin"]);
export const orderIdSchema = z.uuid();
export const productIdSchema = z.uuid();
export const syncRequestSchema = z.object({ adapter: z.literal("amazon").optional() });

export const amazonCredentialInputSchema = z.object({
  clientId: z.string().trim().max(500).default(""),
  clientSecret: z.string().trim().max(500).default(""),
  refreshToken: z.string().trim().max(4_000).default(""),
  endpoint: z.enum([
    "https://sellingpartnerapi-na.amazon.com",
    "https://sellingpartnerapi-eu.amazon.com",
    "https://sellingpartnerapi-fe.amazon.com",
  ]),
  marketplaceIds: z.string().trim().min(1).max(500).transform((value, context) => {
    const ids = [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
    if (!ids.length || ids.length > 20 || ids.some((id) => !/^[A-Z0-9]{6,20}$/.test(id))) {
      context.addIssue({ code: "custom", message: "Enter valid Amazon marketplace IDs separated by commas." });
      return z.NEVER;
    }
    return ids;
  }),
});

export const importRowSchema = z.object({
  order_id: z.string().trim().min(1).max(160),
  marketplace_order_id: z.string().trim().min(1).max(160),
  awb: z.string().trim().max(160).optional().default(""),
  marketplace: z.string().trim().min(1).max(80),
  sku: z.string().trim().min(1).max(100),
  product_title: z.string().trim().min(1).max(240),
  quantity: z.coerce.number().int().positive().max(10_000),
  asin: z.string().trim().max(32).optional().default(""),
  variation: z.string().trim().max(160).optional().default(""),
});

export const importPayloadSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(5_000),
});

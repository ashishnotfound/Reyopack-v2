import { describe, expect, it } from "vitest";
import { amazonCredentialInputSchema, importPayloadSchema, scanSchema } from "@/lib/validators";

describe("request validation", () => {
  it("trims a valid scan and rejects an empty scan", () => {
    expect(scanSchema.parse({ query: "  AWB-1  " }).query).toBe("AWB-1");
    expect(scanSchema.safeParse({ query: "   " }).success).toBe(false);
  });
  it("rejects corrupted CSV quantities", () => {
    const result = importPayloadSchema.safeParse({ rows: [{ order_id: "1", marketplace_order_id: "A", marketplace: "Amazon", sku: "SKU", product_title: "Poster", quantity: 0 }] });
    expect(result.success).toBe(false);
  });
  it("normalizes valid Amazon marketplace IDs and rejects unknown endpoints", () => {
    const parsed = amazonCredentialInputSchema.parse({
      clientId: "",
      clientSecret: "",
      refreshToken: "",
      endpoint: "https://sellingpartnerapi-fe.amazon.com",
      marketplaceIds: " A21TJRUUN4KGV, A21TJRUUN4KGV ",
    });
    expect(parsed.marketplaceIds).toEqual(["A21TJRUUN4KGV"]);
    expect(amazonCredentialInputSchema.safeParse({
      endpoint: "https://example.com",
      marketplaceIds: "A21TJRUUN4KGV",
    }).success).toBe(false);
  });
});

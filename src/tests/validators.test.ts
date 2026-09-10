import { describe, expect, it } from "vitest";
import { normalizeAwbLookup } from "@/lib/awb";
import { amazonCredentialInputSchema, awbLookupSchema, importPayloadSchema } from "@/lib/validators";

describe("request validation", () => {
  it("trims a valid AWB lookup and rejects an empty lookup", () => {
    expect(awbLookupSchema.parse({ query: "  AWB-1  " }).query).toBe("AWB-1");
    expect(awbLookupSchema.safeParse({ query: "   " }).success).toBe(false);
  });
  it("normalizes printed AWB labels without changing internal AWB identifiers", () => {
    expect(normalizeAwbLookup(" AWB 3723 8571 2343 ")).toBe("372385712343");
    expect(normalizeAwbLookup("awb no. # tba12-34 ")).toBe("TBA12-34");
    expect(normalizeAwbLookup("AWB-REYO-24090701")).toBe("AWB-REYO-24090701");
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

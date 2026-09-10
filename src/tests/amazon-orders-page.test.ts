import { describe, expect, it } from "vitest";
import { parseAmazonOrdersPage } from "@/lib/marketplaces/amazon-orders-page";

describe("Amazon Orders API page parsing", () => {
  it("reads the v2026 pagination.nextToken response shape", () => {
    const page = parseAmazonOrdersPage({ orders: [{ orderId: "A-1" }], pagination: { nextToken: "page-2" } });
    expect(page.orders).toHaveLength(1);
    expect(page.nextToken).toBe("page-2");
  });

  it("does not invent a continuation after the final page", () => {
    expect(parseAmazonOrdersPage({ orders: [] }).nextToken).toBeNull();
  });
});

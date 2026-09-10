import { describe, expect, it } from "vitest";
import { buildAmazonOrdersUrl } from "@/lib/marketplaces/amazon-orders-url";

describe("Amazon Orders API URL", () => {
  it("requests fulfillment and package data as one comma-separated parameter", () => {
    const url = buildAmazonOrdersUrl(
      "https://sellingpartnerapi-na.amazon.com",
      ["ATVPDKIKX0DER", "A2EUQ1WTGCTBG2"],
      { updatedAfter: "2026-09-01T00:00:00.000Z" },
    );

    expect(url.searchParams.getAll("includedData")).toEqual(["FULFILLMENT,PACKAGES"]);
    expect(url.searchParams.getAll("marketplaceIds")).toEqual(["ATVPDKIKX0DER", "A2EUQ1WTGCTBG2"]);
    expect(url.searchParams.get("lastUpdatedAfter")).toBe("2026-09-01T00:00:00.000Z");
    expect(url.searchParams.get("maxResultsPerPage")).toBe("100");
  });

  it("keeps the exact search window and filters on subsequent pages", () => {
    const url = buildAmazonOrdersUrl(
      "https://sellingpartnerapi-na.amazon.com",
      ["ATVPDKIKX0DER"],
      { updatedAfter: "2026-09-01T00:00:00.000Z", updatedBefore: "2026-09-10T12:00:00.000Z", paginationToken: "next-page" },
    );

    expect(url.searchParams.get("lastUpdatedAfter")).toBe("2026-09-01T00:00:00.000Z");
    expect(url.searchParams.get("lastUpdatedBefore")).toBe("2026-09-10T12:00:00.000Z");
    expect(url.searchParams.getAll("marketplaceIds")).toEqual(["ATVPDKIKX0DER"]);
    expect(url.searchParams.get("includedData")).toBe("FULFILLMENT,PACKAGES");
    expect(url.searchParams.get("maxResultsPerPage")).toBe("100");
    expect(url.searchParams.get("paginationToken")).toBe("next-page");
  });
});

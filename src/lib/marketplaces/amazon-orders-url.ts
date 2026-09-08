import type { SyncCursor } from "@/lib/marketplaces/types";

export function buildAmazonOrdersUrl(
  endpoint: string,
  marketplaceIds: string[],
  cursor: SyncCursor,
) {
  const url = new URL("/orders/2026-01-01/orders", endpoint);
  if (cursor.paginationToken) {
    url.searchParams.set("paginationToken", cursor.paginationToken);
    return url;
  }

  url.searchParams.set("lastUpdatedAfter", cursor.updatedAfter);
  for (const id of marketplaceIds) url.searchParams.append("marketplaceIds", id);
  url.searchParams.set("includedData", "FULFILLMENT,PACKAGES");
  url.searchParams.set("maxResultsPerPage", "100");
  return url;
}

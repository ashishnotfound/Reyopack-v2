import type { MarketplaceAdapter, SyncCursor } from "@/lib/marketplaces/types";

export class DevelopmentMarketplaceAdapter implements MarketplaceAdapter {
  readonly key = "development";
  readonly displayName = "Development adapter";
  isConfigured() { return process.env.REYO_PACK_DEMO_MODE === "true"; }
  async fetchOrders(cursor: SyncCursor) {
    if (!this.isConfigured()) throw new Error("The development adapter is disabled.");
    return { orders: [], nextToken: null, checkpoint: cursor.updatedAfter };
  }
}

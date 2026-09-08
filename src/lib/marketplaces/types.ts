export interface SyncCursor {
  updatedAfter: string;
  paginationToken?: string | null;
}

export interface NormalizedOrderItem {
  externalItemId: string;
  sellerSku: string;
  asin?: string | null;
  title: string;
  quantity: number;
  variation?: string | null;
}

export interface NormalizedOrder {
  externalOrderId: string;
  marketplaceId: string;
  status: string;
  purchasedAt: string;
  updatedAt: string;
  awb?: string | null;
  items: NormalizedOrderItem[];
  raw: unknown;
}

export interface SyncPage {
  orders: NormalizedOrder[];
  nextToken?: string | null;
  checkpoint: string;
}

export interface MarketplaceAdapter {
  readonly key: string;
  readonly displayName: string;
  isConfigured(): boolean | Promise<boolean>;
  fetchOrders(cursor: SyncCursor): Promise<SyncPage>;
}

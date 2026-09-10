import "server-only";

import { getAmazonAccessToken, loadAmazonCredentials, type AmazonCredentials } from "@/lib/marketplaces/amazon-credentials";
import { amazonApiErrorMessage, amazonRequestHeaders } from "@/lib/marketplaces/amazon-http";
import { buildAmazonOrdersUrl } from "@/lib/marketplaces/amazon-orders-url";
import type { MarketplaceAdapter, NormalizedOrder, SyncCursor, SyncPage } from "@/lib/marketplaces/types";

type AmazonRecord = Record<string, unknown>;

export class AmazonAdapter implements MarketplaceAdapter {
  readonly key = "amazon";
  readonly displayName = "Amazon SP-API";
  private credentialsPromise: Promise<AmazonCredentials | null> | null = null;

  private getCredentials() {
    this.credentialsPromise ??= loadAmazonCredentials();
    return this.credentialsPromise;
  }

  async isConfigured() { return Boolean(await this.getCredentials()); }

  async fetchOrders(cursor: SyncCursor): Promise<SyncPage> {
    const credentials = await this.getCredentials();
    if (!credentials) throw new Error("Amazon SP-API credentials are not configured.");
    const response = await fetchAmazonOrders(credentials, cursor);
    if (!response.ok) throw new Error(await amazonApiErrorMessage(response));
    const payload: AmazonRecord = await response.json();
    const ordersRaw = arrayFrom(payload.orders ?? recordFrom(payload.payload).orders);
    const nextToken = stringFrom(payload.nextToken ?? recordFrom(payload.payload).nextToken);
    const orders = ordersRaw.map(normalizeAmazonOrder).filter((order): order is NormalizedOrder => order !== null);
    const checkpoint = orders.reduce((latest, order) => order.updatedAt > latest ? order.updatedAt : latest, cursor.updatedAfter);
    return { orders, nextToken, checkpoint };
  }

}

export async function verifyAmazonOrdersAccess(credentials: AmazonCredentials) {
  const response = await fetchAmazonOrders(credentials, {
    updatedAfter: new Date(Date.now() - 60 * 60 * 1_000).toISOString(),
  });
  if (!response.ok) throw new Error(await amazonApiErrorMessage(response));
}

async function fetchAmazonOrders(credentials: AmazonCredentials, cursor: SyncCursor) {
  const token = await getAmazonAccessToken(credentials);
  const url = buildAmazonOrdersUrl(credentials.endpoint, credentials.marketplaceIds, cursor);

  return fetchWithBackoff(url, {
    headers: amazonRequestHeaders(token),
    cache: "no-store",
  });
}

function normalizeAmazonOrder(value: unknown): NormalizedOrder | null {
  const order = recordFrom(value);
  const externalOrderId = stringFrom(order.orderId);
  const channel = recordFrom(order.salesChannel);
  if (!externalOrderId) return null;
  const packages = arrayFrom(order.packages).map(recordFrom);
  const firstPackage = packages[0] ?? {};
  const tracking = recordFrom(firstPackage.tracking);
  const items = arrayFrom(order.orderItems).map((itemValue) => {
    const item = recordFrom(itemValue); const product = recordFrom(item.product);
    const quantity = numberFrom(item.quantityOrdered) ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) return null;
    return {
      externalItemId: stringFrom(item.orderItemId) ?? stringFrom(product.sellerSku) ?? stringFrom(product.asin) ?? "unmapped-item",
      sellerSku: stringFrom(product.sellerSku) ?? "UNMAPPED",
      asin: stringFrom(product.asin),
      title: stringFrom(product.title) ?? stringFrom(product.sellerSku) ?? "Unmapped Amazon item",
      quantity,
      variation: null,
    };
  }).filter((item) => item !== null);
  return {
    externalOrderId,
    marketplaceId: stringFrom(channel.marketplaceId) ?? "amazon",
    status: stringFrom(recordFrom(order.fulfillment).fulfillmentStatus) ?? stringFrom(order.fulfillmentStatus) ?? "UNSHIPPED",
    purchasedAt: stringFrom(order.createdTime) ?? new Date().toISOString(),
    updatedAt: stringFrom(order.lastUpdatedTime) ?? new Date().toISOString(),
    awb: stringFrom(firstPackage.trackingNumber) ?? stringFrom(tracking.trackingNumber),
    items,
    raw: value,
  };
}

async function fetchWithBackoff(input: URL, init: RequestInit, attempts = 5) {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(input, init);
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) return response;
    lastResponse = response;
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 750 * 2 ** attempt + Math.random() * 250);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return lastResponse!;
}

function recordFrom(value: unknown): AmazonRecord { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as AmazonRecord : {}; }
function arrayFrom(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringFrom(value: unknown): string | null { return typeof value === "string" && value ? value : null; }
function numberFrom(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && Number.isFinite(Number(value)) ? Number(value) : null; }

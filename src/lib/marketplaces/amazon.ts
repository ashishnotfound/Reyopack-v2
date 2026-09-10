import "server-only";

import { getAmazonAccessToken, loadAmazonCredentials, type AmazonCredentials } from "@/lib/marketplaces/amazon-credentials";
import { amazonApiErrorMessage, amazonRequestHeaders, amazonRetryDelay } from "@/lib/marketplaces/amazon-http";
import { buildAmazonOrdersUrl } from "@/lib/marketplaces/amazon-orders-url";
import { parseAmazonOrdersPage } from "@/lib/marketplaces/amazon-orders-page";
import type { MarketplaceAdapter, NormalizedOrder, SyncCursor, SyncPage, SyncRecordFailure } from "@/lib/marketplaces/types";

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
    const payload: unknown = await response.json();
    const { orders: ordersRaw, nextToken } = parseAmazonOrdersPage(payload);
    const orders: NormalizedOrder[] = [];
    const failures: SyncRecordFailure[] = [];
    ordersRaw.forEach((value, index) => {
      const order = normalizeAmazonOrder(value, index);
      if (order) orders.push(order);
      else failures.push({ externalOrderId: stringFrom(recordFrom(value).orderId), message: `Amazon order at response position ${index + 1} had no orderId.` });
    });
    const checkpoint = orders.reduce((latest, order) => order.updatedAt > latest ? order.updatedAt : latest, cursor.updatedAfter);
    return { orders, fetched: ordersRaw.length, failures, nextToken, checkpoint };
  }

  async fetchOrder(externalOrderId: string): Promise<NormalizedOrder> {
    const credentials = await this.getCredentials();
    if (!credentials) throw new Error("Amazon SP-API credentials are not configured.");
    const token = await getAmazonAccessToken(credentials);
    const url = new URL(`/orders/2026-01-01/orders/${encodeURIComponent(externalOrderId)}`, credentials.endpoint);
    url.searchParams.set("includedData", "FULFILLMENT,PACKAGES");
    const response = await fetchWithBackoff(url, { headers: amazonRequestHeaders(token), cache: "no-store" });
    if (!response.ok) throw new Error(await amazonApiErrorMessage(response));
    const payload: AmazonRecord = await response.json();
    const order = normalizeAmazonOrder(payload.order ?? recordFrom(payload.payload).order);
    if (!order) throw new Error(`Amazon getOrder returned no order for ${externalOrderId}.`);
    return order;
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

function normalizeAmazonOrder(value: unknown, orderIndex = 0): NormalizedOrder | null {
  const order = recordFrom(value);
  const externalOrderId = stringFrom(order.orderId);
  const channel = recordFrom(order.salesChannel);
  if (!externalOrderId) return null;
  const packages = arrayFrom(order.packages).map(recordFrom);
  const firstPackage = packages[0] ?? {};
  const tracking = recordFrom(firstPackage.tracking);
  const items = arrayFrom(order.orderItems).map((itemValue, itemIndex) => {
    const item = recordFrom(itemValue); const product = recordFrom(item.product);
    const quantity = numberFrom(item.quantityOrdered) ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) return null;
    return {
      externalItemId: stringFrom(item.orderItemId) ?? `${stringFrom(product.sellerSku) ?? stringFrom(product.asin) ?? `unmapped-${orderIndex + 1}`}-${itemIndex + 1}`,
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
    if (attempt === attempts - 1 || (response.status === 429 && attempt >= 1)) return response;
    const delay = amazonRetryDelay(response, attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return lastResponse!;
}

function recordFrom(value: unknown): AmazonRecord { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as AmazonRecord : {}; }
function arrayFrom(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringFrom(value: unknown): string | null { return typeof value === "string" && value ? value : null; }
function numberFrom(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && Number.isFinite(Number(value)) ? Number(value) : null; }

type AmazonRecord = Record<string, unknown>;

export function parseAmazonOrdersPage(payload: unknown) {
  const root = recordFrom(payload);
  const legacyPayload = recordFrom(root.payload);
  const pagination = recordFrom(root.pagination ?? legacyPayload.pagination);
  const orders = arrayFrom(root.orders ?? legacyPayload.orders);
  const nextToken = stringFrom(pagination.nextToken ?? root.nextToken ?? legacyPayload.nextToken);
  return { orders, nextToken };
}

function recordFrom(value: unknown): AmazonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as AmazonRecord : {};
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

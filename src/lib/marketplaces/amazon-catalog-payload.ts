type AmazonRecord = Record<string, unknown>;

export function amazonMainImageFromPayload(value: unknown, marketplaceId?: string) {
  const root = recordFrom(value);
  const imageSets = arrayFrom(root.images).map(recordFrom);
  const preferredSet = imageSets.find((set) => stringFrom(set.marketplaceId) === marketplaceId) ?? imageSets[0];
  const images = arrayFrom(preferredSet?.images).map(recordFrom);
  const mainImage = images.find((image) => stringFrom(image.variant) === "MAIN") ?? images[0];
  return safeAmazonImageUrl(stringFrom(mainImage?.link));
}

function safeAmazonImageUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "m.media-amazon.com" ? url.href : null;
  } catch {
    return null;
  }
}

function recordFrom(value: unknown): AmazonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as AmazonRecord : {};
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

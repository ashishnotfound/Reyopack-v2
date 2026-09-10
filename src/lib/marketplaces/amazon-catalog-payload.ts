type AmazonRecord = Record<string, unknown>;

export function amazonMainImageFromPayload(value: unknown, marketplaceId?: string) {
  const root = recordFrom(value);
  const imageSets = arrayFrom(root.images).map(recordFrom);
  const preferredSet = imageSets.find((set) => stringFrom(set.marketplaceId) === marketplaceId) ?? imageSets[0];
  const images = arrayFrom(preferredSet?.images).map(recordFrom);
  const mainImage = images.find((image) => stringFrom(image.variant) === "MAIN") ?? images[0];
  return safeAmazonImageUrl(stringFrom(mainImage?.link));
}

export function amazonSearchMainImageFromPayload(value: unknown, queryTitle: string, marketplaceId?: string) {
  const root = recordFrom(value);
  const ranked = arrayFrom(root.items)
    .map((itemValue) => {
      const item = recordFrom(itemValue);
      const summaries = arrayFrom(item.summaries).map(recordFrom);
      const preferredSummary = summaries.find((summary) => stringFrom(summary.marketplaceId) === marketplaceId) ?? summaries[0];
      return {
        imageUrl: amazonMainImageFromPayload(item, marketplaceId),
        score: titleSimilarity(queryTitle, stringFrom(preferredSummary?.itemName) ?? ""),
      };
    })
    .filter((candidate) => candidate.imageUrl)
    .sort((left, right) => right.score - left.score);

  return ranked[0] && ranked[0].score >= 0.5 ? ranked[0].imageUrl : null;
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

function titleSimilarity(left: string, right: string) {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return (2 * overlap) / (leftTokens.size + rightTokens.size);
}

function titleTokens(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
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

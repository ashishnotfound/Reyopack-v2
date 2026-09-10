import "server-only";

import { getAmazonAccessToken, loadAmazonCredentials, type AmazonCredentials } from "@/lib/marketplaces/amazon-credentials";
import { amazonMainImageFromPayload } from "@/lib/marketplaces/amazon-catalog-payload";
import { amazonApiErrorMessage, amazonRequestHeaders } from "@/lib/marketplaces/amazon-http";
import { createAdminClient } from "@/lib/supabase/admin";

const imageRetryDelayMs = 24 * 60 * 60 * 1_000;
const pendingImages = new Map<string, Promise<string | null>>();

export function resolveAmazonProductImage(productId: string, asin: string) {
  const existing = pendingImages.get(productId);
  if (existing) return existing;

  const pending = resolveAmazonProductImageUncached(productId, asin)
    .finally(() => pendingImages.delete(productId));
  pendingImages.set(productId, pending);
  return pending;
}

async function resolveAmazonProductImageUncached(productId: string, asin: string) {
  if (!/^[A-Z0-9]{10}$/i.test(asin)) return null;

  const admin = createAdminClient();
  const { data: product, error } = await admin
    .from("products")
    .select("image_url,image_synced_at")
    .eq("id", productId)
    .maybeSingle();
  if (error || !product) return null;
  if (product.image_url) return product.image_url;
  if (product.image_synced_at && Date.parse(product.image_synced_at) > Date.now() - imageRetryDelayMs) return null;

  const credentials = await loadAmazonCredentials();
  if (!credentials) return null;
  const imageUrl = await fetchAmazonMainImage(credentials, asin.toUpperCase());
  const { error: updateError } = await admin
    .from("products")
    .update({ image_url: imageUrl, image_synced_at: new Date().toISOString() })
    .eq("id", productId);
  if (updateError) return null;
  return imageUrl;
}

export async function fetchAmazonMainImage(credentials: AmazonCredentials, asin: string) {
  const token = await getAmazonAccessToken(credentials);

  for (const marketplaceId of credentials.marketplaceIds) {
    const url = new URL(`/catalog/2022-04-01/items/${encodeURIComponent(asin)}`, credentials.endpoint);
    url.searchParams.set("marketplaceIds", marketplaceId);
    url.searchParams.set("includedData", "images");
    const response = await fetch(url, {
      headers: amazonRequestHeaders(token),
      cache: "no-store",
    });
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(await amazonApiErrorMessage(response));
    const imageUrl = amazonMainImageFromPayload(await response.json(), marketplaceId);
    if (imageUrl) return imageUrl;
  }

  return null;
}

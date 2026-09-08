import { AmazonAdapter } from "@/lib/marketplaces/amazon";
import { getAmazonCredentialStatus } from "@/lib/marketplaces/amazon-credentials";
import { DevelopmentMarketplaceAdapter } from "@/lib/marketplaces/development";
import { isDemoMode } from "@/lib/config";
import type { MarketplaceAdapter } from "@/lib/marketplaces/types";

export function getMarketplaceAdapter(key = "amazon"): MarketplaceAdapter {
  if (key === "development") return new DevelopmentMarketplaceAdapter();
  if (key === "amazon") return new AmazonAdapter();
  throw new Error(`Unsupported marketplace adapter: ${key}`);
}

export async function getIntegrationStatus() {
  const amazon = new AmazonAdapter();
  const demo = isDemoMode();
  const amazonStatus = demo
    ? {
        configured: false,
        source: null,
        endpoint: "https://sellingpartnerapi-fe.amazon.com" as const,
        marketplaceIds: ["A21TJRUUN4KGV"],
        updatedAt: null,
      }
    : await getAmazonCredentialStatus();
  return [
    { key: amazon.key, name: amazon.displayName, ...amazonStatus, mode: "production" as const },
    { key: "development", name: "Development adapter", configured: demo, mode: "development" as const },
  ];
}

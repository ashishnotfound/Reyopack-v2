import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const amazonCredentialsSchema = z.object({
  clientId: z.string().min(1).max(500),
  clientSecret: z.string().min(1).max(500),
  refreshToken: z.string().min(1).max(4_000),
  endpoint: z.enum([
    "https://sellingpartnerapi-na.amazon.com",
    "https://sellingpartnerapi-eu.amazon.com",
    "https://sellingpartnerapi-fe.amazon.com",
  ]),
  marketplaceIds: z.array(z.string().regex(/^[A-Z0-9]{6,20}$/)).min(1).max(20),
  updatedAt: z.string().optional(),
  active: z.boolean().optional(),
});

export type AmazonCredentials = z.infer<typeof amazonCredentialsSchema>;

type AmazonCredentialStatus = {
  configured: boolean;
  source: "vault" | "environment" | null;
  endpoint: AmazonCredentials["endpoint"];
  marketplaceIds: string[];
  updatedAt: string | null;
};

const defaultEndpoint = "https://sellingpartnerapi-eu.amazon.com" as const;

let tokenCache: { fingerprint: string; token: string; expiresAt: number } | null = null;

function environmentCredentials(): AmazonCredentials | null {
  const marketplaceIds = process.env.AMAZON_SP_API_MARKETPLACE_IDS
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const parsed = amazonCredentialsSchema.safeParse({
    clientId: process.env.AMAZON_SP_API_CLIENT_ID,
    clientSecret: process.env.AMAZON_SP_API_CLIENT_SECRET,
    refreshToken: process.env.AMAZON_SP_API_REFRESH_TOKEN,
    endpoint: process.env.AMAZON_SP_API_ENDPOINT ?? defaultEndpoint,
    marketplaceIds,
  });
  return parsed.success ? parsed.data : null;
}

async function vaultCredentials(): Promise<AmazonCredentials | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_marketplace_credentials", {
    p_marketplace_key: "amazon",
  });
  if (error) throw new Error("Amazon credentials could not be read from secure storage.");
  const parsed = amazonCredentialsSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function loadAmazonCredentials(): Promise<AmazonCredentials | null> {
  return (await vaultCredentials()) ?? environmentCredentials();
}

export async function getAmazonCredentialStatus(): Promise<AmazonCredentialStatus> {
  const vault = await vaultCredentials();
  const credentials = vault ?? environmentCredentials();
  return {
    configured: Boolean(credentials),
    source: vault ? "vault" : credentials ? "environment" : null,
    endpoint: credentials?.endpoint ?? defaultEndpoint,
    marketplaceIds: credentials?.marketplaceIds ?? ["A21TJRUUN4KGV"],
    updatedAt: credentials?.updatedAt ?? null,
  };
}

export async function saveAmazonCredentials(credentials: AmazonCredentials) {
  const parsed = amazonCredentialsSchema.parse(credentials);
  const admin = createAdminClient();
  const { error } = await admin.rpc("set_marketplace_credentials", {
    p_marketplace_key: "amazon",
    p_credentials: {
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
      refreshToken: parsed.refreshToken,
      endpoint: parsed.endpoint,
      marketplaceIds: parsed.marketplaceIds,
    },
  });
  if (error) throw new Error("Amazon credentials could not be saved securely.");
}

export async function getAmazonAccessToken(credentials: AmazonCredentials) {
  const fingerprint = createHash("sha256")
    .update(`${credentials.clientId}\0${credentials.clientSecret}\0${credentials.refreshToken}`)
    .digest("hex");
  if (tokenCache?.fingerprint === fingerprint && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const response = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Amazon rejected these Login with Amazon credentials.");
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("Amazon did not return an access token.");

  tokenCache = {
    fingerprint,
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3_600) * 1_000,
  };
  return tokenCache.token;
}

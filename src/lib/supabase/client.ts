"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicConfig } from "@/lib/config";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (browserClient) return browserClient;

  const config = getPublicConfig();
  browserClient = createBrowserClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return browserClient;
}

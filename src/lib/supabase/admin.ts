import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerConfig } from "@/lib/config";

export function createAdminClient() {
  const config = getServerConfig();
  if (!config.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY is required for this admin operation.");
  }

  return createClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { runMarketplaceSync } from "@/lib/marketplaces/sync";

export const maxDuration = 300;

export async function POST() {
  if (!await getViewer()) return NextResponse.json({ error: "Sign in to sync orders." }, { status: 401 });
  try { return NextResponse.json(await runMarketplaceSync(isDemoMode() ? "development" : "amazon")); }
  catch { return NextResponse.json({ error: "Sync could not finish, or another sync is running. Retry shortly; contact an admin if this continues." }, { status: 503 }); }
}

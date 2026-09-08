import { NextResponse } from "next/server";
import { runMarketplaceSync } from "@/lib/marketplaces/sync";
import { securelyMatches } from "@/lib/secure-compare";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!securelyMatches(request.headers.get("authorization"), secret ? `Bearer ${secret}` : undefined)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await runMarketplaceSync("amazon")); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed." }, { status: 500 }); }
}

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { runMarketplaceSync } from "@/lib/marketplaces/sync";
import { syncRequestSchema } from "@/lib/validators";

export const maxDuration = 300;

export async function POST(request: Request) {
  await requireRole(["admin", "super_admin"]);
  const body: unknown = await request.json().catch(() => ({}));
  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid sync request." }, { status: 400 });
  const adapter = isDemoMode() ? "development" : parsed.data.adapter ?? "amazon";
  try { return NextResponse.json(await runMarketplaceSync(adapter)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed." }, { status: 500 }); }
}

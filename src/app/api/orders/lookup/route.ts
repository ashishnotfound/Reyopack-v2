import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { lookupOrder } from "@/lib/data";
import { scanSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const parsed = scanSchema.safeParse({ query: url.searchParams.get("q") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid order ID or barcode." }, { status: 400 });
  }

  const result = await lookupOrder(parsed.data.query);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  return NextResponse.json({ order: result.data }, { headers: { "Cache-Control": "no-store" } });
}

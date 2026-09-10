import { NextResponse } from "next/server";
import { normalizeAwbLookup } from "@/lib/awb";
import { getViewer } from "@/lib/auth";
import { lookupOrder } from "@/lib/data";
import { resolveAmazonProductImage } from "@/lib/marketplaces/amazon-catalog";
import { awbLookupSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const parsed = awbLookupSchema.safeParse({ query: url.searchParams.get("q") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid AWB number." }, { status: 400 });
  }

  const result = await lookupOrder(normalizeAwbLookup(parsed.data.query));
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "AWB not found." }, { status: 404 });

  const firstItem = result.data.items[0];
  if (firstItem && !firstItem.imageUrl && firstItem.asin) {
    try {
      const imageUrl = await resolveAmazonProductImage(firstItem.productId, firstItem.asin);
      if (imageUrl) firstItem.imageUrl = imageUrl;
    } catch {
      // Artwork is helpful but must never prevent a worker from packing an order.
    }
  }

  return NextResponse.json({ order: result.data }, { headers: { "Cache-Control": "no-store" } });
}

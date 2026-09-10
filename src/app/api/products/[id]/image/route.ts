import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { resolveAmazonProductImage } from "@/lib/marketplaces/amazon-catalog";
import { productIdSchema } from "@/lib/validators";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await getViewer()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = productIdSchema.safeParse((await params).id);
  if (!parsed.success) return NextResponse.json({ error: "Invalid product." }, { status: 400 });
  try {
    return NextResponse.json({ imageUrl: await resolveAmazonProductImage(parsed.data) }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ imageUrl: null }, { headers: { "Cache-Control": "private, max-age=60" } });
  }
}

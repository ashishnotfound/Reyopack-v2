import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const path = new URL(request.url).searchParams.get("path")?.trim();
  if (!path || path.includes("..") || path.startsWith("/")) return NextResponse.json({ error: "Invalid artwork path" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("product-artwork").createSignedUrl(path, 60, { transform: { width: 900, height: 1125, resize: "contain", quality: 80 } });
  if (error || !data.signedUrl) return NextResponse.json({ error: "Artwork unavailable" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, max-age=45" } });
}

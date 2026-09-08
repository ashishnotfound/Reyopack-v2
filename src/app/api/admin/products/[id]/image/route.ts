import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { hasValidImageSignature } from "@/lib/file-signatures";
import { productIdSchema } from "@/lib/validators";

const allowedTypes = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin", "super_admin"]);
  if (isDemoMode()) return NextResponse.json({ error: "Uploads are disabled in the development adapter." }, { status: 409 });
  const { id } = await params;
  const parsedId = productIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  const extension = allowedTypes.get(file.type);
  if (!extension || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Use a JPG, PNG, or WebP image up to 10 MB." }, { status: 400 });
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasValidImageSignature(file.type, signature)) return NextResponse.json({ error: "The file contents do not match a supported image format." }, { status: 400 });
  const supabase = await createClient();
  const path = `${parsedId.data}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("product-artwork").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 409 });
  const { count } = await supabase.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", parsedId.data);
  const { error: insertError } = await supabase.from("product_images").insert({ product_id: parsedId.data, storage_path: path, alt_text: String(formData.get("altText") ?? "Product artwork").slice(0, 240), is_primary: (count ?? 0) === 0 });
  if (insertError) { await supabase.storage.from("product-artwork").remove([path]); return NextResponse.json({ error: insertError.message }, { status: 409 }); }
  return NextResponse.json({ storagePath: path });
}

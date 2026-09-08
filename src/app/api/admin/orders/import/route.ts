import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { importPayloadSchema } from "@/lib/validators";

export async function POST(request: Request) {
  await requireRole(["admin", "super_admin"]);
  if (isDemoMode()) return NextResponse.json({ error: "CSV writes are disabled in the development adapter." }, { status: 409 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = importPayloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "The import contains invalid rows.", issues: parsed.error.issues }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_orders", { p_rows: parsed.data.rows });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json(data);
}

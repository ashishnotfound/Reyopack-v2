import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { packDemoOrder } from "@/lib/demo-runtime";
import { createClient } from "@/lib/supabase/server";
import { orderIdSchema, packSchema } from "@/lib/validators";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsedId = orderIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = packSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid packing request." }, { status: 400 });
  }

  if (isDemoMode()) {
    const result = packDemoOrder();
    return NextResponse.json(result);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pack_order", {
    p_order_id: parsedId.data,
    p_device_id: parsed.data.deviceId,
    p_user_agent: parsed.data.userAgent ?? request.headers.get("user-agent"),
  });

  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

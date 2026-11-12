import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { orderIdSchema } from "@/lib/validators";
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getViewer()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = orderIdSchema.safeParse((await params).id);
  if (!id.success)
    return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ recorded: true });
  const db = await createClient();
  const { error } = await db.rpc("record_order_scan", { p_order_id: id.data });
  if (error)
    return NextResponse.json(
      {
        error:
          "Scan was not recorded. Order may be cancelled/dispatched or your session expired. Retry before packing.",
      },
      { status: 409 },
    );
  return NextResponse.json(
    { recorded: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

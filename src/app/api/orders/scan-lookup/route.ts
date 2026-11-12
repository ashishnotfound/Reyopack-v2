import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { normalizeAwbLookup } from "@/lib/awb";
import { lookupOrder } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { awbLookupSchema } from "@/lib/validators";

const inputSchema = awbLookupSchema.extend({
  exact: z.boolean().default(false),
});
// A decoded identifier makes one HTTP request. Read-only Checking still uses the
// existing lookup path; this POST confirms the scan before enabling packing.
export async function POST(request: Request) {
  if (!(await getViewer()))
    return NextResponse.json(
      { error: "Sign in before scanning." },
      { status: 401 },
    );
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Enter a valid AWB number." },
      { status: 400 },
    );
  const result = await lookupOrder(
    normalizeAwbLookup(input.data.query),
    input.data.exact,
  );
  if (result.error)
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes("Multiple orders") ? 409 : 503 },
    );
  if (!result.data)
    return NextResponse.json({ error: "AWB not found." }, { status: 404 });
  if (
    !isDemoMode() &&
    result.data.state !== "cancelled" &&
    !result.data.handedOver
  ) {
    const db = await createClient();
    const { error } = await db.rpc("record_order_scan", {
      p_order_id: result.data.id,
    });
    if (error)
      return NextResponse.json(
        {
          error:
            "Scan could not be saved. Order may have changed or your session expired. Retry before packing.",
        },
        { status: 409 },
      );
  }
  return NextResponse.json(
    { order: result.data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

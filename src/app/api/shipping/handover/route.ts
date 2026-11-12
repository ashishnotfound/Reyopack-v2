import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
export async function POST(request: Request) {
  if (!(await getViewer()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const value = z
    .object({ ids: z.array(z.uuid()).min(1), confirmed: z.literal(true) })
    .safeParse(await request.json().catch(() => null));
  if (!value.success)
    return NextResponse.json(
      { error: "Confirm physical carrier handover and select packed orders." },
      { status: 400 },
    );
  if (isDemoMode())
    return NextResponse.json(
      { error: "Carrier handover requires the connected database." },
      { status: 409 },
    );
  const db = await createClient();
  const { data, error } = await db.rpc("confirm_carrier_handover", {
    p_ids: value.data.ids,
  });
  if (error)
    return NextResponse.json(
      {
        error:
          "Handover was not confirmed. Refresh and select only packed, non-cancelled orders.",
      },
      { status: 409 },
    );
  return NextResponse.json({ updated: data });
}

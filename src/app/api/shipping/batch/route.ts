import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
const schema = z.object({
  all: z.boolean(),
  ids: z.array(z.uuid()),
  exclude: z.array(z.uuid()),
});
export async function POST(request: Request) {
  if (!(await getViewer()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const value = schema.safeParse(await request.json().catch(() => null));
  if (!value.success)
    return NextResponse.json({ error: "Invalid selection." }, { status: 400 });
  if (isDemoMode())
    return NextResponse.json(
      {
        error:
          "Batch creation requires the connected database; demo data is read-only for batches.",
      },
      { status: 409 },
    );
  const db = await createClient();
  const { data, error } = await db.rpc("start_packing_batch", {
    p_all: value.data.all,
    p_ids: value.data.ids,
    p_exclude: value.data.exclude,
  });
  if (error)
    return NextResponse.json(
      {
        error:
          error.code === "42501"
            ? "Not permitted."
            : "No eligible unpacked orders selected, or selection changed. Refresh the queue and retry.",
      },
      { status: 409 },
    );
  return NextResponse.json(data);
}

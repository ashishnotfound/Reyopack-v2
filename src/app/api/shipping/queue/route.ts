import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { getDemoOrder } from "@/lib/demo-runtime";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const schema = z.object({
  filter: z
    .enum([
      "today",
      "overdue",
      "upcoming",
      "unscanned",
      "waiting",
      "dispatched",
      "cancelled",
      "exceptions",
      "all",
    ])
    .default("today"),
  page: z.coerce.number().int().min(1).max(2147483647).default(1),
  batch: z.uuid().optional(),
});
export async function GET(request: Request) {
  if (!(await getViewer()))
    return NextResponse.json(
      { error: "Sign in to view shipping orders." },
      { status: 401 },
    );
  const parsed = schema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid shipping filter." },
      { status: 400 },
    );
  if (isDemoMode()) {
    const order = getDemoOrder()!;
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(new Date());
    const active = ["today", "all", "unscanned"].includes(parsed.data.filter);
    return NextResponse.json({
      date,
      page: parsed.data.page,
      pageSize: 50,
      total: active ? 1 : 0,
      counts: {
        today: 1,
        scanned: 0,
        unscanned: 1,
        remaining: order.state === "packed" ? 0 : 1,
        packed: order.state === "packed" ? 1 : 0,
      },
      orders:
        active && parsed.data.page === 1
          ? [{ ...order, shipByDate: date }]
          : [],
    });
  }
  const db = await createClient();
  const { data, error } = await db.rpc("shipping_queue", {
    p_filter: parsed.data.filter,
    p_page: parsed.data.page,
    p_batch: parsed.data.batch ?? null,
  });
  if (error)
    return NextResponse.json(
      {
        error:
          "Shipping queue unavailable. Retry or check that the shipping migration is installed.",
      },
      { status: 503 },
    );
  let batchCounts: { total:number;remaining:number;scanned:number;packed:number } | undefined;
  if(parsed.data.batch){
    const base=()=>db.from('packing_batch_orders').select('order_id,orders!inner(id)',{count:'exact',head:true}).eq('batch_id',parsed.data.batch!);
    const counts=await Promise.all([base(),base().eq('orders.state','pending').eq('orders.handed_over',false),base().not('orders.scanned_at','is',null),base().eq('orders.state','packed')]);
    if(counts.some(result=>result.error))return NextResponse.json({error:'Batch progress could not be loaded. Retry.'},{status:503});
    batchCounts={total:counts[0].count??0,remaining:counts[1].count??0,scanned:counts[2].count??0,packed:counts[3].count??0};
  }
  return NextResponse.json({...data,...(batchCounts?{batchCounts}:{})}, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

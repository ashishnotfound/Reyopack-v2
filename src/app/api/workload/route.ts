import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { getDemoOrder } from "@/lib/demo-runtime";

export async function GET(request: Request) {
  if (!await getViewer()) return NextResponse.json({ error: "Sign in to view orders." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const page = Number(params.get("page") ?? 1);
  const filter = params.get("filter") ?? "all";
  if (!Number.isInteger(page) || page < 1 || page > 2147483647 || !["all", "today", "upcoming", "unpacked", "packed", "waiting", "overdue"].includes(filter)) {
    return NextResponse.json({ error: "Invalid page or filter." }, { status: 400 });
  }
  if (isDemoMode()) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const order = getDemoOrder()!;
    const packed = order.state === "packed";
    const matches = !["upcoming", "overdue"].includes(filter) && (filter !== "unpacked" || !packed) && (!["packed", "waiting"].includes(filter) || packed);
    return NextResponse.json({ date, page, pageSize: 50, total: matches ? 1 : 0, counts: { today: 1, unpacked: packed ? 0 : 1, packed: packed ? 1 : 0, waiting: packed ? 1 : 0, overdue: 0, totalOrders: 1 }, orders: matches && page === 1 ? [{ ...order, shipByDate: date }] : [] });
  }
  const db = await createClient();
  const { data, error } = await db.rpc("worker_workload", { p_filter: filter, p_page: page });
  if (error) return NextResponse.json({ error: "Could not load workload. Please retry." }, { status: 503 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { getDemoOrder } from "@/lib/demo-runtime";
import { z } from "zod";
import { isCancelledForDispatch } from "@/lib/shipping";
export async function POST(request: Request) {
  if (!(await getViewer()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = z
    .object({
      orderIds: z.array(z.string().regex(/^\d{3}-\d{7}-\d{7}$/)).max(250),
      awbs: z
        .array(z.string().regex(/^[A-Z0-9-]{10,20}$/))
        .max(250)
        .default([]),
    })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Invalid label identifiers." },
      { status: 400 },
    );
  if (isDemoMode()) {
    const o = getDemoOrder()!;
    return NextResponse.json({
      orders: [
        {
          id: o.id,
          marketplace_order_id: o.marketplaceOrderId,
          awb: o.awb,
          state: o.state,
          handed_over: false,
        },
      ],
    });
  }
  const db = await createClient();
  async function matches(
    column: "marketplace_order_id" | "awb",
    values: string[],
  ) {
    const rows: {
      id: string;
      marketplace_order_id: string;
      awb: string | null;
      state: string;
      handed_over: boolean;
      marketplace_status: string | null;
    }[] = [];
    if (!values.length) return { data: rows, error: null };
    for (let offset = 0; ; offset += 500) {
      const result = await db
        .from("orders")
        .select(
          "id,marketplace_order_id,awb,state,handed_over,marketplace_status",
        )
        .in(column, values)
        .order("id")
        .range(offset, offset + 499);
      if (result.error) return { data: rows, error: result.error };
      rows.push(...result.data);
      if (result.data.length < 500) return { data: rows, error: null };
    }
  }
  const [byId, byAwb] = await Promise.all([
    matches("marketplace_order_id", input.data.orderIds),
    matches("awb", input.data.awbs),
  ]);
  if (byId.error || byAwb.error)
    return NextResponse.json(
      {
        error:
          "Could not verify labels against synced orders. Retry before printing.",
      },
      { status: 503 },
    );
  return NextResponse.json(
    {
      orders: [
        ...new Map(
          [...(byId.data ?? []), ...(byAwb.data ?? [])].map((o) => [o.id, o]),
        ).values(),
      ].map((order) => ({
        ...order,
        state: isCancelledForDispatch({
          state: order.state,
          marketplaceStatus: order.marketplace_status,
        })
          ? "cancelled"
          : order.state,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

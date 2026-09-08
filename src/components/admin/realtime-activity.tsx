"use client";

import { useEffect, useState } from "react";
import { ActivityTable } from "@/components/admin/activity-table";
import { createClient } from "@/lib/supabase/client";
import type { PackingActivity } from "@/types/domain";

export function RealtimeActivity({ initialRows, enabled, workerId }: { initialRows: PackingActivity[]; enabled: boolean; workerId?: string }) {
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    const channel = supabase.channel("admin-packing-activity").on("postgres_changes", { event: "INSERT", schema: "public", table: "packing_events" }, (payload: { new: Record<string, unknown> }) => {
      const row = payload.new;
      const next: PackingActivity = {
        id: String(row.id), workerDisplayName: String(row.worker_display_name), workerId: String(row.worker_user_id), orderId: String(row.order_id), orderNumber: String(row.internal_order_number), marketplaceOrderId: String(row.marketplace_order_id), productTitle: String(row.product_title), sku: String(row.sku), quantity: Number(row.quantity), marketplace: String(row.marketplace), packedAt: String(row.packed_at),
      };
      if (workerId && next.workerId !== workerId) return;
      setRows((current) => [next, ...current.filter((item) => item.id !== next.id)].slice(0, 200));
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [enabled, workerId]);
  return <ActivityTable rows={rows} />;
}

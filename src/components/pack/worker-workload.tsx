"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SyncNowButton } from "@/components/admin/sync-now-button";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import type { PackOrder, Viewer } from "@/types/domain";

type Workload = {
  date: string; page: number; pageSize: number; total: number;
  counts: { today: number; unpacked: number; packed: number; waiting: number; overdue: number; totalOrders: number };
  orders: (PackOrder & { marketplaceStatus?: string })[];
};
const filters = [["all", "All orders"], ["today", "Today"], ["upcoming", "Tomorrow / Upcoming"], ["unpacked", "Unpacked"], ["packed", "Packed"], ["waiting", "Waiting for Pickup"], ["overdue", "Missed / Overdue"]] as const;
const orderDateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function WorkerWorkload({ viewer, realtime }: { viewer: Viewer; realtime: boolean }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Workload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestRef = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch(`/api/workload?filter=${filter}&page=${page}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Unable to update orders. Check your connection and retry.");
      const result = await response.json() as Workload;
      if (controller.signal.aborted) return;
      const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
      if (page > lastPage) { setPage(lastPage); return; }
      setData(result); setError("");
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to update orders.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [filter, page]);

  useEffect(() => {
    // State updates in refresh follow the asynchronous network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; void refresh(); }, 400);
    };
    const poll = setInterval(() => { if (document.visibilityState === "visible") schedule(); }, 15000);
    window.addEventListener("focus", schedule);
    window.addEventListener("online", schedule);
    const db = realtime ? createClient() : null;
    const channel = db?.channel("worker-workload").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, schedule).subscribe();
    return () => {
      requestRef.current?.abort(); clearTimeout(timer); clearInterval(poll);
      window.removeEventListener("focus", schedule); window.removeEventListener("online", schedule);
      if (db && channel) void db.removeChannel(channel);
    };
  }, [refresh, realtime]);

  const select = (value: string) => {
    if (value === filter && page === 1) { void refresh(); return; }
    setLoading(true); setFilter(value); setPage(1);
  };
  const cards = data ? [
    ["Going Today", data.counts.today, "today"], ["Unpacked Today", data.counts.unpacked, "unpacked"],
    ["Packed Today", data.counts.packed, "packed"], ["Total Waiting for Pickup", data.counts.waiting, "waiting"],
    ["Missed / Overdue Orders", data.counts.overdue, "overdue"], ["Total Orders", data.counts.totalOrders, "all"],
  ] as const : [];
  return <main className="mx-auto min-h-screen max-w-7xl space-y-5 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Order status</h1><p className="text-sm text-muted-foreground">{viewer.displayName} · Ship dates in India time</p></div><div className="flex gap-2"><Button asChild><Link href="/pack"><ScanLine />Scan AWB</Link></Button>{viewer.role !== "worker" ? <Button asChild variant="outline"><Link href="/admin">Admin</Link></Button> : null}</div></header>
    {error ? <div role="alert" className="rounded-xl border border-destructive p-3 text-destructive">{error} {data ? "Showing the last loaded figures." : ""}<Button variant="outline" className="ml-3" onClick={() => void refresh()}>Retry</Button></div> : null}
    <section aria-label="Packing workload" className="grid grid-cols-2 gap-3 lg:grid-cols-6">{cards.map(([label, value, target]) => <button key={label} onClick={() => select(target)} className={`rounded-xl border p-4 text-left ${target === "overdue" && value > 0 ? "border-red-500 bg-red-50 text-red-950 dark:bg-red-950 dark:text-red-50" : "bg-card"}`}><span className="block text-sm font-medium">{label}</span><span className="mono-data mt-2 block text-3xl font-bold">{value.toLocaleString()}</span></button>)}</section>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Live workload · Urgent orders first · Checking never marks an order packed</p><SyncNowButton endpoint="/api/workload/sync" label="Sync Orders" onSynced={refresh} /></div>
    <nav aria-label="Filter orders" className="flex flex-wrap gap-2">{filters.map(([value, label]) => <Button key={value} variant={filter === value ? "default" : "outline"} aria-pressed={filter === value} onClick={() => select(value)}>{label}</Button>)}</nav>
    <div aria-live="polite" className="text-sm text-muted-foreground">{loading ? "Loading orders…" : `${data?.total.toLocaleString() ?? 0} orders · Page ${page} of ${Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 50)))}`}</div>
    <section aria-label="Order list" aria-busy={loading} className="space-y-3">
      {!loading && !data?.orders.length ? <p className="rounded-xl border p-8 text-center">No orders in this filter.</p> : null}
      {data?.orders.map((order) => {
        const overdue = Boolean(order.shipByDate && order.shipByDate < data.date && !order.handedOver);
        const packed = order.state === "packed";
        const date = order.shipByDate ? orderDateFormatter.format(new Date(`${order.shipByDate}T12:00:00+05:30`)) : null;
        return <article key={order.id} className={`rounded-xl border bg-card p-4 ${overdue ? "border-l-4 border-red-500" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mono-data font-semibold">{order.marketplaceOrderId}</p><p className={`mt-1 text-sm font-bold ${overdue ? "text-red-600 dark:text-red-400" : ""}`}>{overdue ? <><AlertTriangle className="mr-1 inline size-4" />OVERDUE — Was due {date}</> : date ? `Going: ${order.shipByDate === data.date ? "Today" : date}` : "Going: Missing date"}</p></div><span className={`rounded-full px-3 py-1 text-sm font-semibold ${packed ? "bg-primary/15 text-primary" : "bg-muted"}`}>{packed ? "Packed" : "Unpacked"}{order.handedOver ? " · Shipped / Picked up" : packed ? " · Waiting for pickup" : ""}</span></div>
          <ul className="my-3 space-y-1">{order.items.map((item) => <li key={item.id} className="flex justify-between gap-3"><span>{item.title}</span><strong className="shrink-0">Qty {item.quantity}</strong></li>)}</ul>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{order.packing ? `Packed by ${order.packing.workerDisplayName} · ${formatDateTime(order.packing.packedAt)}` : "Not packed yet"}{order.marketplaceStatus ? ` · ${order.marketplaceStatus.replaceAll("_", " ")}` : ""}</p><Button asChild variant="outline"><Link href={`/pack?awb=${encodeURIComponent(order.awb ?? order.marketplaceOrderId)}`}>Checking / Open order</Link></Button></div>
        </article>;
      })}
    </section>
    <footer className="flex justify-between gap-3"><Button variant="outline" disabled={loading || page <= 1} onClick={() => { setLoading(true); setPage(page - 1); }}>Previous</Button><Button variant="outline" disabled={loading || !data || page * data.pageSize >= data.total} onClick={() => { setLoading(true); setPage(page + 1); }}>Next</Button></footer>
  </main>;
}

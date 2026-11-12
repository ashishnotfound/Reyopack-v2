"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SyncNowButton } from "@/components/admin/sync-now-button";
import { createClient } from "@/lib/supabase/client";
import {
  batchEligible,
  isCancelledForDispatch,
  shippingStatus,
  type ShippingOrder,
} from "@/lib/shipping";
type Queue = {
  date: string;
  page: number;
  pageSize: number;
  total: number;
  orders: ShippingOrder[];
  batchCounts?: {total:number;remaining:number;scanned:number;packed:number};
  counts: {
    today: number;
    scanned: number;
    unscanned: number;
    remaining: number;
    packed: number;
  };
};
const filters = [
  ["today", "Ship Today"],
  ["overdue", "Overdue"],
  ["upcoming", "Upcoming"],
  ["unscanned", "View Unscanned Orders"],
  ["waiting", "Waiting for Pickup"],
  ["dispatched", "Dispatched"],
  ["cancelled", "Cancelled"],
  ["exceptions", "Review Exceptions"],
] as const;
export function ShipToday({
  realtime,
  initialBatch = null,
}: {
  realtime: boolean;
  initialBatch?: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState(initialBatch ? "all" : "today");
  const [page, setPage] = useState(1);
  const [batch, setBatch] = useState<string | null>(initialBatch);
  const [data, setData] = useState<Queue | null>(null);
  const [all, setAll] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(
        `/api/shipping/queue?filter=${filter}&page=${page}${batch ? `&batch=${batch}` : ""}`,
        { cache: "no-store", signal: controller.signal },
      );
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      if (!controller.signal.aborted) {
        setData(value);
        setMessage("");
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error ? error.message : "Queue unavailable.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filter, page, batch]);
  useEffect(() => {
    // Asynchronous refresh is the external data subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), 250);
    };
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") schedule();
    }, 15000);
    window.addEventListener("online", schedule);
    window.addEventListener("focus", schedule);
    const db = realtime ? createClient() : null;
    const channel = db
      ?.channel("ship-today")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        schedule,
      )
      .subscribe();
    return () => {
      request.current?.abort();
      clearInterval(poll);
      clearTimeout(debounce);
      window.removeEventListener("online", schedule);
      window.removeEventListener("focus", schedule);
      if (db && channel) void db.removeChannel(channel);
    };
  }, [refresh, realtime]);
  function clearSelection() {
    setAll(false);
    setIds([]);
    setExclude([]);
  }
  function selectFilter(next: string) {
    setFilter(next);
    setPage(1);
    clearSelection();
    setLoading(true);
  }
  async function startBatch() {
    setBusy(true);
    try {
      const response = await fetch("/api/shipping/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all, ids, exclude }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setBatch(result.id);
      setFilter("all");
      setPage(1);
      clearSelection();
      try {
        localStorage.setItem("reyo-active-batch", result.id);
      } catch {
        /* The shared batch URL remains resumable. */
      }
      router.replace(`/ship-today?batch=${result.id}`);
      setMessage(`Batch started: ${result.total} orders.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Batch could not start.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function handover() {
    if (
      !window.confirm(
        "Confirm these selected packed packages have physically been handed to the carrier? This does not confirm shipment to Amazon.",
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch("/api/shipping/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, confirmed: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      clearSelection();
      await refresh();
      setMessage(`${result.updated} physical handovers recorded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Handover failed.");
    } finally {
      setBusy(false);
    }
  }
  function printSelected() {
    sessionStorage.setItem(
      "reyo-label-selection",
      JSON.stringify({ all, ids, exclude, batch, date: data?.date }),
    );
    router.push("/labels");
  }
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ship Today</h1>
          <p className="text-sm text-muted-foreground">
            Amazon ship-by date · India time · Scan, pack, then hand over
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/pack">Scan AWB</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/workload">Orders</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/labels">Labels</Link>
          </Button>
        </div>
      </header>
      <section
        aria-label="Daily shipping progress"
        className="grid grid-cols-2 gap-3 sm:grid-cols-5"
      >
        {data
          ? Object.entries({
              "Due today": data.counts.today,
              Scanned: data.counts.scanned,
              Unscanned: data.counts.unscanned,
              "Remaining to pack": data.counts.remaining,
              Packed: data.counts.packed,
            }).map(([label, count]) => (
              <div key={label} className="rounded-xl border p-4">
                <p className="text-sm">{label}</p>
                <strong className="text-3xl">{count.toLocaleString()}</strong>
              </div>
            ))
          : null}
      </section>
      <div className="flex flex-wrap gap-2">
        {filters.map(([key, label]) => (
          <Button
            key={key}
            variant={filter === key ? "default" : "outline"}
            onClick={() => selectFilter(key)}
          >
            {label}
          </Button>
        ))}
        <SyncNowButton
          endpoint="/api/workload/sync"
          label="Sync Orders"
          onSynced={refresh}
        />
      </div>
      {batch ? (
        <div className="rounded border p-3">
          Active batch <span className="break-all">{batch}</span>
          {data?.batchCounts ? <p className="mt-2 font-semibold">Batch: {data.batchCounts.total} orders · {data.batchCounts.scanned} scanned · {data.batchCounts.packed} packed · {data.batchCounts.remaining} left to pack</p> : null}
          <Button asChild variant="outline" className="ml-2">
            <Link href={`/ship-today?batch=${batch}`}>
              Shareable batch link
            </Link>
          </Button>
          <Button
            variant="outline"
            className="ml-2"
            onClick={() => {
              setBatch(null);
              try {
                localStorage.removeItem("reyo-active-batch");
              } catch {
                /* Optional device preference. */
              }
              selectFilter("today");
              router.replace("/ship-today");
            }}
          >
            Exit batch
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => {
            try {
              const saved = localStorage.getItem("reyo-active-batch");
              if (saved)
                router.push(`/ship-today?batch=${encodeURIComponent(saved)}`);
              else setMessage("No saved batch on this device.");
            } catch {
              setMessage(
                "Open the shared batch link to resume; device storage is unavailable.",
              );
            }
          }}
        >
          Resume last batch
        </Button>
      )}
      <section
        aria-label="Batch actions"
        className="flex flex-wrap items-center gap-3 rounded-xl border p-4"
      >
        <Button
          variant="outline"
          disabled={busy || loading || filter !== "today" || Boolean(batch)}
          onClick={() => {
            setAll(true);
            setIds([]);
            setExclude([]);
          }}
        >
          Select All Eligible
        </Button>
        <span>
          {all
            ? `All eligible today across every page (${exclude.length} excluded)`
            : `${ids.length} selected`}
        </span>
        <Button variant="outline" onClick={clearSelection}>
          Clear selection
        </Button>
        <Button
          disabled={busy || loading || (!all && !ids.length)}
          onClick={() => void startBatch()}
        >
          Start Batch Packing
        </Button>
        <Button
          variant="outline"
          disabled={busy || (!all && !ids.length)}
          onClick={printSelected}
        >
          Print Selected Labels
        </Button>
        <Button
          variant="outline"
          disabled={busy || all || !ids.length}
          onClick={() => void handover()}
        >
          Handed to Carrier
        </Button>
      </section>
      <p
        role="status"
        className={
          message
            ? "rounded border border-amber-500 p-3"
            : "text-sm text-muted-foreground"
        }
      >
        {message ||
          `${loading ? "Loading…" : `${data?.total ?? 0} orders · Page ${page}`} · Scanning never marks an order packed or shipped.`}
      </p>
      <section aria-label="Shipping orders" className="space-y-3">
        {data?.orders.map((order) => {
          const eligible = batchEligible(order);
          const selected = all
            ? eligible && !exclude.includes(order.id)
            : ids.includes(order.id);
          const overdue = Boolean(
            order.shipByDate &&
              order.shipByDate < data.date &&
              !order.handedOver &&
              !isCancelledForDispatch(order),
          );
          return (
            <article
              key={order.id}
              className={`rounded-xl border p-4 ${overdue ? "border-l-4 border-red-600" : ""}`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-5 shrink-0"
                  aria-label={`Select ${order.marketplaceOrderId}`}
                  checked={selected}
                  disabled={
                    busy ||
                    loading ||
                    isCancelledForDispatch(order) ||
                    order.handedOver ||
                    (all && !eligible)
                  }
                  onChange={() => {
                    if (all)
                      setExclude(
                        selected
                          ? [...exclude, order.id]
                          : exclude.filter((id) => id !== order.id),
                      );
                    else
                      setIds(
                        selected
                          ? ids.filter((id) => id !== order.id)
                          : [...ids, order.id],
                      );
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="break-all font-semibold">
                    {order.marketplaceOrderId}
                  </p>
                  <p className={overdue ? "font-bold text-red-600" : "text-sm"}>
                    {overdue ? "OVERDUE — Was due " : "Going: "}
                    {order.shipByDate === data.date
                      ? "Today"
                      : (order.shipByDate ?? "Missing date")}
                  </p>
                  <p className="font-semibold">{shippingStatus(order)}</p>
                  <p className="break-all text-sm">
                    AWB: {order.awb ?? "Missing label / AWB"}
                  </p>
                  {order.items.map((item) => (
                    <p key={item.id} className="text-sm">
                      {item.title} <strong>×{item.quantity}</strong>
                    </p>
                  ))}
                  {!order.items.length ? (
                    <p role="alert">
                      Missing product data — review before packing
                    </p>
                  ) : null}
                </div>
                <Button asChild variant="outline">
                  <Link
                    href={`/pack?awb=${encodeURIComponent(order.marketplaceOrderId)}`}
                  >
                    Scan / Pack
                  </Link>
                </Button>
              </div>
            </article>
          );
        })}
        {!loading && data?.total === 0 ? (
          <p>No orders in this filter.</p>
        ) : null}
      </section>
      <footer className="flex justify-between">
        <Button
          variant="outline"
          disabled={loading || page <= 1}
          onClick={() => {
            setPage(page - 1);
            setLoading(true);
          }}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={loading || !data || page * data.pageSize >= data.total}
          onClick={() => {
            setPage(page + 1);
            setLoading(true);
          }}
        >
          Next
        </Button>
      </footer>
    </main>
  );
}

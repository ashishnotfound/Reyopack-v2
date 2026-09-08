import "server-only";

import { hasSupabaseConfig, isDemoMode } from "@/lib/config";
import {
  DEMO_ACTIVITY,
  DEMO_LOCATIONS,
  DEMO_ORDER,
  DEMO_PRODUCTS,
  DEMO_STATS,
  DEMO_WORKERS,
} from "@/lib/demo-data";
import { getDemoActivity, getDemoOrder } from "@/lib/demo-runtime";
import { createClient } from "@/lib/supabase/server";
import type {
  DashboardStats,
  LocationSummary,
  PackOrder,
  PackingActivity,
  ProductSummary,
  WorkerSummary,
} from "@/types/domain";

type Result<T> = { data: T; error: string | null };

export async function lookupOrder(query: string): Promise<Result<PackOrder | null>> {
  if (isDemoMode()) return { data: getDemoOrder(query), error: null };
  if (!hasSupabaseConfig()) {
    return { data: null, error: "Supabase is not configured." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_order", { p_query: query });
  return {
    data: normalizeArtworkOrder((data as PackOrder | null) ?? null),
    error: error?.message ?? null,
  };
}

export async function getDashboardData(): Promise<{
  stats: DashboardStats;
  activity: PackingActivity[];
  workerCounts: Array<{ name: string; count: number }>;
}> {
  if (isDemoMode()) {
    return {
      stats: DEMO_STATS,
      activity: getDemoActivity(),
      workerCounts: [
        { name: "Reyo", count: 52 },
        { name: "Worker 2", count: 44 },
      ],
    };
  }

  if (!hasSupabaseConfig()) {
    return {
      stats: { total: 0, packed: 0, remaining: 0, cancelled: 0, activeWorkers: 0 },
      activity: [],
      workerCounts: [],
    };
  }

  const supabase = await createClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const since = start.toISOString();

  const [total, packed, cancelled, workers, activityResult, workerEvents] =
    await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("orders").select("id", { count: "exact", head: true }).gte("packed_at", since),
      supabase.from("orders").select("id", { count: "exact", head: true }).gte("cancelled_at", since),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("packing_events").select("*").gte("packed_at", since).order("packed_at", { ascending: false }).limit(12),
      supabase.from("packing_events").select("worker_display_name").gte("packed_at", since),
    ]);

  const totalCount = total.count ?? 0;
  const packedCount = packed.count ?? 0;
  const cancelledCount = cancelled.count ?? 0;
  const counts = new Map<string, number>();
  for (const event of workerEvents.data ?? []) {
    counts.set(event.worker_display_name, (counts.get(event.worker_display_name) ?? 0) + 1);
  }

  return {
    stats: {
      total: totalCount,
      packed: packedCount,
      remaining: Math.max(0, totalCount - packedCount - cancelledCount),
      cancelled: cancelledCount,
      activeWorkers: workers.count ?? 0,
    },
    activity: (activityResult.data ?? []).map(mapActivity),
    workerCounts: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function listPackingActivity(limit = 100, workerId?: string): Promise<PackingActivity[]> {
  if (isDemoMode()) return workerId ? getDemoActivity().filter((row) => row.workerId === workerId) : getDemoActivity();
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  let query = supabase
    .from("packing_events")
    .select("*")
    .order("packed_at", { ascending: false })
    .limit(limit);
  if (workerId) query = query.eq("worker_user_id", workerId);
  const { data } = await query;
  return (data ?? []).map(mapActivity);
}

export async function listOrders(query = ""): Promise<PackOrder[]> {
  if (isDemoMode()) {
    const orders = [getDemoOrder()!, ...DEMO_ACTIVITY.map(demoActivityOrder)];
    if (!query) return orders;
    const normalized = query.trim().toLowerCase();
    return orders.filter((order) => [order.orderNumber, order.marketplaceOrderId, order.awb, ...order.items.map((item) => item.sku)]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalized)));
  }
  if (!hasSupabaseConfig()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_search_orders", {
    p_query: query || null,
    p_limit: 100,
  });
  if (error) return [];
  return ((data ?? []) as PackOrder[]).map((order) => normalizeArtworkOrder(order)!);
}

export async function getOrderDetail(id: string): Promise<PackOrder | null> {
  if (isDemoMode()) {
    if (id === DEMO_ORDER.id) return getDemoOrder();
    const activity = DEMO_ACTIVITY.find((event) => event.orderId === id);
    return activity ? demoActivityOrder(activity) : null;
  }
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_order_detail", { p_order_id: id });
  return normalizeArtworkOrder((data as PackOrder | null) ?? null);
}

export async function listProducts(): Promise<ProductSummary[]> {
  if (isDemoMode()) return DEMO_PRODUCTS;
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, sku, title, asin, active, locations(code)")
    .order("title");
  return (data ?? []).map((row) => ({
    id: row.id,
    sku: row.sku,
    title: row.title,
    asin: row.asin,
    active: row.active,
    location: relationOne(row.locations)?.code ?? null,
  }));
}

export async function listWorkers(): Promise<WorkerSummary[]> {
  if (isDemoMode()) return DEMO_WORKERS;
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [profiles, events] = await Promise.all([
    supabase.from("profiles").select("id, display_name, email, active, user_roles(role)").order("display_name"),
    supabase.from("packing_events").select("worker_user_id").gte("packed_at", start.toISOString()),
  ]);
  const counts = new Map<string, number>();
  for (const event of events.data ?? []) {
    counts.set(event.worker_user_id, (counts.get(event.worker_user_id) ?? 0) + 1);
  }
  return (profiles.data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    active: row.active,
    role: (relationOne(row.user_roles)?.role ?? "worker") as WorkerSummary["role"],
    packedToday: counts.get(row.id) ?? 0,
  }));
}

export async function listLocations(): Promise<LocationSummary[]> {
  if (isDemoMode()) return DEMO_LOCATIONS;
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("id, code, rack, shelf, bin, active, warehouses(name)")
    .order("code");
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    rack: row.rack,
    shelf: row.shelf,
    bin: row.bin,
    active: row.active,
    warehouseName: relationOne(row.warehouses)?.name ?? "Warehouse",
  }));
}

export async function listWarehouses() {
  if (isDemoMode()) {
    return [{ id: "60000000-0000-4000-8000-000000000001", name: "Reyo Store — Main" }];
  }
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("warehouses").select("id, name").eq("active", true).order("name");
  return data ?? [];
}

export async function getRetentionStatus() {
  if (isDemoMode()) {
    return {
      retentionDays: 7,
      lastCleanup: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      status: "succeeded",
      deleted: 31,
      errorMessage: null,
      nextCleanup: nextCleanupAt(),
    };
  }
  if (!hasSupabaseConfig()) {
    return { retentionDays: 7, lastCleanup: null, status: "not_configured", deleted: 0, errorMessage: null, nextCleanup: nextCleanupAt() };
  }
  const supabase = await createClient();
  const [{ data: setting }, { data: cleanup }] = await Promise.all([
    supabase.from("system_settings").select("value").eq("key", "retention_days").maybeSingle(),
    supabase.from("cleanup_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    retentionDays: Number(setting?.value ?? 7),
    lastCleanup: cleanup?.finished_at ?? cleanup?.started_at ?? null,
    status: cleanup?.status ?? "never_run",
    deleted: cleanup?.records_deleted ?? 0,
    errorMessage: cleanup?.error_message ?? null,
    nextCleanup: nextCleanupAt(),
  };
}

export async function getReports() {
  if (isDemoMode()) {
    return {
      packedOrders: 96,
      units: 101,
      byMarketplace: [
        { label: "Amazon India", value: 81 },
        { label: "Flipkart", value: 15 },
      ],
      topSkus: [
        { label: "FRIEREN-A4-01", value: 23 },
        { label: "BMW-M3-A4-02", value: 18 },
        { label: "PORSCHE-911-A3", value: 14 },
      ],
    };
  }
  if (!hasSupabaseConfig()) return { packedOrders: 0, units: 0, byMarketplace: [], topSkus: [] };
  const supabase = await createClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data } = await supabase.from("packing_events").select("marketplace, sku, quantity").gte("packed_at", start.toISOString());
  const events = data ?? [];
  return {
    packedOrders: events.length,
    units: events.reduce((sum, row) => sum + row.quantity, 0),
    byMarketplace: aggregate(events, (row) => row.marketplace, () => 1),
    topSkus: aggregate(events, (row) => row.sku, (row) => row.quantity).slice(0, 8),
  };
}

function mapActivity(row: Record<string, unknown>): PackingActivity {
  return {
    id: String(row.id),
    workerDisplayName: String(row.worker_display_name),
    workerId: String(row.worker_user_id),
    orderId: String(row.order_id),
    orderNumber: String(row.internal_order_number),
    marketplaceOrderId: String(row.marketplace_order_id),
    productTitle: String(row.product_title),
    sku: String(row.sku),
    quantity: Number(row.quantity),
    marketplace: String(row.marketplace),
    packedAt: String(row.packed_at),
  };
}

function relationOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function aggregate<T>(rows: T[], key: (row: T) => string, amount: (row: T) => number) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(key(row), (totals.get(key(row)) ?? 0) + amount(row));
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function nextCleanupAt() {
  const next = new Date();
  next.setUTCHours(2, 15, 0, 0);
  if (next <= new Date()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function normalizeArtworkOrder(order: PackOrder | null) {
  if (!order) return null;
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      imageUrl: item.imageUrl && !item.imageUrl.startsWith("http")
        ? `/api/artwork?path=${encodeURIComponent(item.imageUrl)}`
        : item.imageUrl,
    })),
  };
}

function demoActivityOrder(activity: PackingActivity): PackOrder {
  return {
    ...structuredClone(DEMO_ORDER),
    id: activity.orderId,
    orderNumber: activity.orderNumber,
    marketplaceOrderId: activity.marketplaceOrderId,
    awb: null,
    marketplace: activity.marketplace,
    state: "packed",
    items: [{
      ...structuredClone(DEMO_ORDER.items[0]),
      id: activity.id,
      title: activity.productTitle,
      sku: activity.sku,
      quantity: activity.quantity,
    }],
    packing: {
      id: activity.id,
      workerId: activity.workerId,
      workerDisplayName: activity.workerDisplayName,
      packedAt: activity.packedAt,
    },
  };
}

import "server-only";

import { getMarketplaceAdapter } from "@/lib/marketplaces";
import { resolveSyncedOrderState } from "@/lib/marketplaces/order-state";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MarketplaceAdapter, NormalizedOrder } from "@/lib/marketplaces/types";

const syncVersion = 2;
const overlapMs = 5 * 60_000;
const amazonConsistencyLagMs = 2 * 60_000;
const initialBackfillMs = 729 * 86_400_000;
const requestBudgetMs = 225_000;
const paginationTokenMaxAgeMs = 23 * 60 * 60_000;

type SyncStats = {
  fetched: number;
  added: number;
  updated: number;
  unchanged: number;
  failed: number;
  pages: number;
};

export async function runMarketplaceSync(adapterKey = "amazon") {
  const adapter = getMarketplaceAdapter(adapterKey);
  if (!(await adapter.isConfigured())) throw new Error(`${adapter.displayName} is not configured.`);
  if (adapterKey === "development") {
    return { status: "succeeded", fetched: 0, added: 0, updated: 0, unchanged: 0, failed: 0, imported: 0, pages: 0, checkpoint: new Date().toISOString(), hasMore: false };
  }

  const admin = createAdminClient();
  const { data: marketplace, error: marketplaceError } = await admin.from("marketplaces")
    .upsert({ key: adapter.key, name: adapter.displayName, active: true }, { onConflict: "key" })
    .select("id").single();
  if (marketplaceError) throw new Error(marketplaceError.message);

  const lease = crypto.randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc("claim_sync", { p_marketplace: marketplace.id, p_lease: lease });
  if (claimError) throw new Error(claimError.message);
  if (!claimed) throw new Error("A sync is already running. Please try again shortly.");

  let runId: string | null = null;
  let resumeToken: string | null = null;
  let stats: SyncStats = { fetched: 0, added: 0, updated: 0, unchanged: 0, failed: 0, pages: 0 };
  try {
    const repaired = await repairCompletedRun(admin, marketplace.id, adapter);
    if (repaired) return repaired;

    const resumeResult = await admin.from("sync_runs")
      .select("*").eq("marketplace_id", marketplace.id).eq("status", "running").eq("sync_version", syncVersion)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (resumeResult.error) throw new Error(resumeResult.error.message);
    let run = resumeResult.data;

    if (run && Date.now() - Date.parse(run.started_at) > paginationTokenMaxAgeMs) {
      await admin.from("sync_runs").update({
        status: "failed", finished_at: new Date().toISOString(), pagination_token: null,
        error_message: "Amazon pagination token expired before the sync could resume; restarting the same range.",
      }).eq("id", run.id);
      run = null;
    }

    if (!run) {
      const { data: previous, error: previousError } = await admin.from("sync_runs")
        .select("checkpoint").eq("marketplace_id", marketplace.id).eq("status", "succeeded").eq("sync_version", syncVersion)
        .order("finished_at", { ascending: false }).limit(1).maybeSingle();
      if (previousError) throw new Error(previousError.message);
      const previousCheckpoint = previous?.checkpoint ? Date.parse(previous.checkpoint) : Number.NaN;
      const windowStart = Number.isFinite(previousCheckpoint)
        ? new Date(previousCheckpoint - overlapMs).toISOString()
        : new Date(Date.now() - initialBackfillMs).toISOString();
      const windowEnd = new Date(Date.now() - amazonConsistencyLagMs).toISOString();
      const inserted = await admin.from("sync_runs").insert({
        marketplace_id: marketplace.id, status: "running", sync_version: syncVersion,
        checkpoint: windowStart, window_start: windowStart, window_end: windowEnd,
      }).select("*").single();
      if (inserted.error) throw new Error(inserted.error.message);
      run = inserted.data;
    }

    runId = run.id;
    resumeToken = run.pagination_token as string | null;
    const windowStart = String(run.window_start ?? run.checkpoint);
    const windowEnd = String(run.window_end);
    if (!Number.isFinite(Date.parse(windowStart)) || !Number.isFinite(Date.parse(windowEnd))) {
      throw new Error("The saved Amazon sync window is invalid.");
    }
    stats = {
      fetched: Number(run.records_fetched ?? 0),
      added: Number(run.records_added ?? 0),
      updated: Number(run.records_updated ?? 0),
      unchanged: Number(run.records_unchanged ?? 0),
      failed: Number(run.records_failed ?? 0),
      pages: Number(run.pages_processed ?? 0),
    };
    const requestStartedAt = Date.now();
    let hasMore = true;

    while (hasMore) {
      const pageNumber = stats.pages + 1;
      let page;
      try {
        page = await adapter.fetchOrders({ updatedAfter: windowStart, updatedBefore: windowEnd, paginationToken: resumeToken });
      } catch (error) {
        await logSyncFailure(admin, run.id, "request", pageNumber, null, error, { windowStart, windowEnd });
        console.error("Amazon sync request failed", { runId: run.id, pageNumber, error: leftError(error) });
        throw error;
      }
      if (page.nextToken && page.nextToken === resumeToken) {
        const error = new Error("Amazon returned the same pagination token instead of advancing to the next page.");
        await logSyncFailure(admin, run.id, "request", pageNumber, null, error, { windowStart, windowEnd });
        throw error;
      }

      stats.fetched += page.fetched;
      stats.failed += page.failures.length;
      for (const failure of page.failures) {
        await logSyncFailure(admin, run.id, "normalization", pageNumber, failure.externalOrderId ?? null, failure.message, {});
      }

      for (let offset = 0; offset < page.orders.length; offset += 5) {
        const batch = page.orders.slice(offset, offset + 5);
        const results = await Promise.allSettled(batch.map((order) => upsertOrder(admin, marketplace.id, order)));
        for (const [index, result] of results.entries()) {
          const order = batch.at(index)!;
          if (result.status === "fulfilled") incrementResult(stats, result.value);
          else {
            stats.failed += 1;
            await logSyncFailure(admin, run.id, "order", pageNumber, order.externalOrderId, result.reason, {});
            console.error("Amazon order sync failed", { runId: run.id, pageNumber, amazonOrderId: order.externalOrderId, error: leftError(result.reason) });
          }
        }
      }

      stats.pages += 1;
      resumeToken = page.nextToken ?? null;
      hasMore = Boolean(resumeToken);
      const finalStatus = !hasMore && stats.failed > 0 ? "failed" : hasMore ? "running" : "succeeded";
      const { error: saveError } = await admin.from("sync_runs").update({
        checkpoint: finalStatus === "succeeded" ? windowEnd : windowStart,
        pagination_token: resumeToken, pages_processed: stats.pages,
        records_processed: stats.added + stats.updated + stats.unchanged,
        records_fetched: stats.fetched, records_added: stats.added, records_updated: stats.updated,
        records_unchanged: stats.unchanged, records_failed: stats.failed,
        status: finalStatus, finished_at: hasMore ? null : new Date().toISOString(),
        error_message: finalStatus === "failed" ? `${stats.failed} Amazon order record(s) could not be synchronized. See sync_failures.` : null,
      }).eq("id", run.id);
      if (saveError) throw new Error(saveError.message);
      if (hasMore && Date.now() - requestStartedAt >= requestBudgetMs) break;
    }

    const status = hasMore ? "running" : stats.failed > 0 ? "failed" : "succeeded";
    return {
      status, ...stats, imported: stats.added + stats.updated,
      checkpoint: status === "succeeded" ? windowEnd : windowStart,
      hasMore,
    };
  } catch (error) {
    if (runId) {
      await admin.from("sync_runs").update({
        pagination_token: resumeToken,
        records_processed: stats.added + stats.updated + stats.unchanged,
        records_fetched: stats.fetched, records_added: stats.added, records_updated: stats.updated,
        records_unchanged: stats.unchanged, records_failed: stats.failed,
        pages_processed: stats.pages, error_message: leftError(error),
      }).eq("id", runId);
    }
    throw error;
  } finally {
    const { error } = await admin.from("marketplaces").update({ sync_lease: null, sync_lease_until: null })
      .eq("id", marketplace.id).eq("sync_lease", lease);
    if (error) console.error("Sync lease release failed.");
  }
}

function leftError(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Marketplace sync failed.")).slice(0, 500);
}

function incrementResult(stats: SyncStats, result: "added" | "updated" | "unchanged") {
  if (result === "added") stats.added += 1;
  else if (result === "updated") stats.updated += 1;
  else stats.unchanged += 1;
}

async function repairCompletedRun(admin: AdminClient, marketplaceId: string, adapter: MarketplaceAdapter) {
  if (!adapter.fetchOrder) return null;
  const { data: run, error: runError } = await admin.from("sync_runs").select("*")
    .eq("marketplace_id", marketplaceId).eq("status", "failed").eq("sync_version", syncVersion)
    .is("pagination_token", null).gt("records_failed", 0).not("window_end", "is", null)
    .order("finished_at", { ascending: false }).limit(1).maybeSingle();
  if (runError) throw new Error(runError.message);
  if (!run) return null;

  const { data: failures, error: failuresError } = await admin.from("sync_failures")
    .select("stage,amazon_order_id").eq("sync_run_id", run.id).is("resolved_at", null);
  if (failuresError) throw new Error(failuresError.message);
  if ((failures ?? []).some((failure) => failure.stage !== "order" || !failure.amazon_order_id)) return null;
  const orderIds = [...new Set((failures ?? []).map((failure) => String(failure.amazon_order_id)))];
  if (!orderIds.length) return null;

  await admin.from("sync_runs").update({
    status: "failed", finished_at: new Date().toISOString(), pagination_token: null,
    error_message: "Superseded by targeted repair of the completed Amazon backfill.",
  }).eq("marketplace_id", marketplaceId).eq("status", "running").eq("sync_version", syncVersion).neq("id", run.id);

  const stats: SyncStats = {
    fetched: Number(run.records_fetched ?? 0), added: Number(run.records_added ?? 0),
    updated: Number(run.records_updated ?? 0), unchanged: Number(run.records_unchanged ?? 0),
    failed: orderIds.length, pages: Number(run.pages_processed ?? 0),
  };
  for (const orderId of orderIds) {
    try {
      const order = await adapter.fetchOrder(orderId);
      incrementResult(stats, await upsertOrder(admin, marketplaceId, order));
      stats.failed -= 1;
      await admin.from("sync_failures").update({ resolved_at: new Date().toISOString() })
        .eq("sync_run_id", run.id).eq("stage", "order").eq("amazon_order_id", orderId).is("resolved_at", null);
      await admin.from("sync_runs").update({
        records_failed: stats.failed, records_added: stats.added, records_updated: stats.updated,
        records_unchanged: stats.unchanged, records_processed: stats.added + stats.updated + stats.unchanged,
      }).eq("id", run.id);
    } catch (error) {
      await logSyncFailure(admin, run.id, "order", stats.pages, orderId, error, { operation: "getOrder repair" });
      console.error("Amazon order repair failed", { runId: run.id, amazonOrderId: orderId, error: leftError(error) });
      throw error;
    }
  }

  const checkpoint = String(run.window_end);
  const { error: saveError } = await admin.from("sync_runs").update({
    status: "succeeded", checkpoint, records_failed: stats.failed,
    records_processed: stats.added + stats.updated + stats.unchanged,
    records_added: stats.added, records_updated: stats.updated, records_unchanged: stats.unchanged,
    error_message: null, finished_at: new Date().toISOString(),
  }).eq("id", run.id);
  if (saveError) throw new Error(saveError.message);
  return { status: "succeeded", ...stats, imported: stats.added + stats.updated, checkpoint, hasMore: false };
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function logSyncFailure(
  admin: AdminClient,
  runId: string,
  stage: "request" | "normalization" | "order",
  pageNumber: number,
  amazonOrderId: string | null,
  error: unknown,
  requestContext: Record<string, unknown>,
) {
  const { error: logError } = await admin.from("sync_failures").insert({
    sync_run_id: runId, stage, page_number: pageNumber, amazon_order_id: amazonOrderId,
    request_context: requestContext, error_message: leftError(error),
  });
  if (logError) console.error("Amazon sync failure could not be persisted", { runId, stage, pageNumber });
}

async function upsertOrder(admin: AdminClient, marketplaceId: string, order: NormalizedOrder): Promise<"added" | "updated" | "unchanged"> {
  const { data: existing, error: existingError } = await admin.from("orders")
    .select("id,state,marketplace_updated_at,packed_at,cancelled_at")
    .eq("marketplace_id", marketplaceId).eq("marketplace_order_id", order.externalOrderId).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const incomingUpdatedAt = Date.parse(order.updatedAt);
  const existingUpdatedAt = existing?.marketplace_updated_at ? Date.parse(existing.marketplace_updated_at) : Number.NaN;
  if (!Number.isFinite(incomingUpdatedAt)) throw new Error("Amazon returned an invalid lastUpdatedTime.");
  if (Number.isFinite(existingUpdatedAt) && existingUpdatedAt > incomingUpdatedAt) return "unchanged";
  if (existing && existingUpdatedAt === incomingUpdatedAt) {
    const itemCount = await admin.from("order_items").select("id", { count: "exact", head: true }).eq("order_id", existing.id);
    if (itemCount.error) throw new Error(itemCount.error.message);
    if ((itemCount.count ?? 0) >= order.items.length) return "unchanged";
  }

  const state = resolveSyncedOrderState(existing?.state, order.status);
  const action = existing
    ? existingUpdatedAt === incomingUpdatedAt ? "unchanged" as const : "updated" as const
    : "added" as const;
  const { data: savedOrder, error } = await admin.from("orders").upsert({
    marketplace_id: marketplaceId, marketplace_order_id: order.externalOrderId,
    order_number: `AMZ-${order.externalOrderId}`, awb: order.awb ?? null, state,
    marketplace_status: order.status, purchased_at: order.purchasedAt,
    marketplace_updated_at: order.updatedAt,
    packed_at: state === "packed" ? existing?.packed_at ?? null : null,
    cancelled_at: state === "cancelled" ? order.updatedAt : existing?.cancelled_at ?? null,
    raw_payload: order.raw,
  }, { onConflict: "marketplace_id,marketplace_order_id" }).select("id").single();
  if (error) throw new Error(error.message);

  for (const item of order.items) {
    const { data: product, error: productError } = await admin.from("products")
      .upsert({ sku: item.sellerSku, title: item.title, asin: item.asin ?? null }, { onConflict: "sku" }).select("id").single();
    if (productError) throw new Error(productError.message);
    const { error: mappingError } = await admin.from("marketplace_products").upsert({
      marketplace_id: marketplaceId, product_id: product.id, marketplace_sku: item.sellerSku, asin: item.asin ?? null,
    }, { onConflict: "marketplace_id,marketplace_sku" });
    if (mappingError) throw new Error(mappingError.message);
    const { error: itemError } = await admin.from("order_items").upsert({
      order_id: savedOrder.id, product_id: product.id, marketplace_item_id: item.externalItemId,
      title_snapshot: item.title, sku_snapshot: item.sellerSku, variation: item.variation ?? null, quantity: item.quantity,
    }, { onConflict: "order_id,marketplace_item_id" });
    if (itemError) throw new Error(itemError.message);
  }
  return action;
}

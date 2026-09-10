import "server-only";

import { getMarketplaceAdapter } from "@/lib/marketplaces";
import { resolveSyncedOrderState } from "@/lib/marketplaces/order-state";
import { createAdminClient } from "@/lib/supabase/admin";

export async function runMarketplaceSync(adapterKey = "amazon") {
  const adapter = getMarketplaceAdapter(adapterKey);
  if (!(await adapter.isConfigured())) throw new Error(`${adapter.displayName} is not configured.`);
  if (adapterKey === "development") return { imported: 0, pages: 0, checkpoint: new Date().toISOString(), hasMore: false };

  const admin = createAdminClient();
  const { data: marketplace, error: marketplaceError } = await admin.from("marketplaces").upsert({ key: adapter.key, name: adapter.displayName, active: true }, { onConflict: "key" }).select("id").single();
  if (marketplaceError) throw new Error(marketplaceError.message);
  const lease = crypto.randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc("claim_sync", { p_marketplace: marketplace.id, p_lease: lease });
  if (claimError) throw new Error(claimError.message);
  if (!claimed) throw new Error("A sync is already running. Please try again shortly.");

  let runId: string | null = null;
  let resumeToken: string | null = null;
  try {
    const { data: resumable, error: resumeError } = await admin.from("sync_runs")
      .select("*").eq("marketplace_id", marketplace.id).eq("status", "running")
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (resumeError) throw new Error(resumeError.message);
    let run = resumable;
    if (!run) {
      const { data: previous, error: previousError } = await admin.from("sync_runs").select("checkpoint")
        .eq("marketplace_id", marketplace.id).eq("status", "succeeded")
        .order("finished_at", { ascending: false }).limit(1).maybeSingle();
      if (previousError) throw new Error(previousError.message);
      const checkpoint = previous?.checkpoint
        ? new Date(Date.parse(previous.checkpoint) - 120000).toISOString()
        : new Date(Date.now() - 730 * 86400000).toISOString();
      const inserted = await admin.from("sync_runs").insert({ marketplace_id: marketplace.id, status: "running", checkpoint }).select("*").single();
      if (inserted.error) throw new Error(inserted.error.message);
      run = inserted.data;
    }
    runId = run.id;
    resumeToken = run.pagination_token as string | null;
    let checkpoint = run.checkpoint as string;
    let imported = Number(run.records_processed ?? 0);
    let pages = Number(run.pages_processed ?? 0);
    let hasMore = true;
    const requestStartedAt = Date.now();

    // Save every page, then continue while the serverless request still has a safe time budget.
    // The token makes the next request resume exactly where this one stopped, with no order cap.
    while (hasMore) {
      const page = await adapter.fetchOrders({ updatedAfter: checkpoint, paginationToken: resumeToken });
      if (page.nextToken && page.nextToken === resumeToken) throw new Error("Amazon returned the same pagination token. Retry the sync later.");
      for (let offset = 0; offset < page.orders.length; offset += 5) {
        await Promise.all(page.orders.slice(offset, offset + 5).map((order) => upsertOrder(admin, marketplace.id, order)));
      }
      imported += page.orders.length;
      pages += 1;
      checkpoint = page.checkpoint > checkpoint ? page.checkpoint : checkpoint;
      resumeToken = page.nextToken ?? null;
      hasMore = Boolean(resumeToken);
      const { error: saveError } = await admin.from("sync_runs").update({
        checkpoint, records_processed: imported, pages_processed: pages, pagination_token: resumeToken,
        status: hasMore ? "running" : "succeeded", finished_at: hasMore ? null : new Date().toISOString(),
        error_message: null,
      }).eq("id", run.id);
      if (saveError) throw new Error(saveError.message);
      if (hasMore && Date.now() - requestStartedAt >= 225_000) break;
    }
    return { imported, pages, checkpoint, hasMore };
  } catch (error) {
    if (runId) {
      const invalidToken = Boolean(resumeToken) && /(?:pagination|next)\s*token|invalid token/i.test(leftError(error));
      await admin.from("sync_runs").update({
        status: invalidToken ? "failed" : "running",
        pagination_token: invalidToken ? null : resumeToken,
        error_message: leftError(error),
        finished_at: invalidToken ? new Date().toISOString() : null,
      }).eq("id", runId);
    }
    throw error;
  } finally {
    const { error } = await admin.from("marketplaces").update({ sync_lease: null, sync_lease_until: null }).eq("id", marketplace.id).eq("sync_lease", lease);
    if (error) console.error("Sync lease release failed.");
  }
}

function leftError(error: unknown) {
  return (error instanceof Error ? error.message : "Marketplace sync failed.").slice(0, 500);
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function upsertOrder(admin: AdminClient, marketplaceId: string, order: import("@/lib/marketplaces/types").NormalizedOrder) {
  const { data: existing, error: existingError } = await admin
    .from("orders")
    .select("state")
    .eq("marketplace_id", marketplaceId)
    .eq("marketplace_order_id", order.externalOrderId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const state = resolveSyncedOrderState(existing?.state, order.status);
  const { data: savedOrder, error } = await admin.from("orders").upsert({ marketplace_id: marketplaceId, marketplace_order_id: order.externalOrderId, order_number: `AMZ-${order.externalOrderId}`, awb: order.awb ?? null, state, marketplace_status: order.status, purchased_at: order.purchasedAt, marketplace_updated_at: order.updatedAt, cancelled_at: state === "cancelled" ? order.updatedAt : null, raw_payload: order.raw }, { onConflict: "marketplace_id,marketplace_order_id" }).select("id").single();
  if (error) throw new Error(error.message);
  for (const item of order.items) {
    const { data: product, error: productError } = await admin.from("products").upsert({ sku: item.sellerSku, title: item.title, asin: item.asin ?? null }, { onConflict: "sku" }).select("id").single();
    if (productError) throw new Error(productError.message);
    const { error: mappingError } = await admin.from("marketplace_products").upsert({ marketplace_id: marketplaceId, product_id: product.id, marketplace_sku: item.sellerSku, asin: item.asin ?? null }, { onConflict: "marketplace_id,marketplace_sku" });
    if (mappingError) throw new Error(mappingError.message);
    const { error: itemError } = await admin.from("order_items").upsert({ order_id: savedOrder.id, product_id: product.id, marketplace_item_id: item.externalItemId, title_snapshot: item.title, sku_snapshot: item.sellerSku, variation: item.variation ?? null, quantity: item.quantity }, { onConflict: "order_id,marketplace_item_id" });
    if (itemError) throw new Error(itemError.message);
  }
}

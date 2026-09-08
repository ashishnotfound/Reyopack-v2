import "server-only";

import { getMarketplaceAdapter } from "@/lib/marketplaces";
import { resolveSyncedOrderState } from "@/lib/marketplaces/order-state";
import { createAdminClient } from "@/lib/supabase/admin";

export async function runMarketplaceSync(adapterKey = "amazon") {
  const adapter = getMarketplaceAdapter(adapterKey);
  if (!(await adapter.isConfigured())) throw new Error(`${adapter.displayName} is not configured.`);
  if (adapterKey === "development") return { imported: 0, pages: 0, checkpoint: new Date().toISOString() };

  const admin = createAdminClient();
  const { data: marketplace, error: marketplaceError } = await admin.from("marketplaces").upsert({ key: adapter.key, name: adapter.displayName, active: true }, { onConflict: "key" }).select("id").single();
  if (marketplaceError) throw new Error(marketplaceError.message);
  const { data: previous } = await admin.from("sync_runs").select("checkpoint").eq("marketplace_id", marketplace.id).eq("status", "succeeded").order("finished_at", { ascending: false }).limit(1).maybeSingle();
  let checkpoint = previous?.checkpoint ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: run, error: runError } = await admin.from("sync_runs").insert({ marketplace_id: marketplace.id, status: "running", checkpoint }).select("id").single();
  if (runError) throw new Error(runError.message);

  let paginationToken: string | null | undefined;
  let imported = 0;
  let pages = 0;
  try {
    do {
      const page = await adapter.fetchOrders({ updatedAfter: checkpoint, paginationToken });
      for (const order of page.orders) {
        await upsertOrder(admin, marketplace.id, order);
        imported += 1;
      }
      paginationToken = page.nextToken;
      checkpoint = page.checkpoint;
      pages += 1;
      await admin.from("sync_runs").update({ checkpoint, records_processed: imported }).eq("id", run.id);
      if (pages >= 1000) throw new Error("Sync stopped at the 1,000-page safety limit.");
    } while (paginationToken);
    await admin.from("sync_runs").update({ status: "succeeded", checkpoint, records_processed: imported, finished_at: new Date().toISOString() }).eq("id", run.id);
    return { imported, pages, checkpoint };
  } catch (error) {
    await admin.from("sync_runs").update({ status: "failed", error_message: safeError(error), finished_at: new Date().toISOString() }).eq("id", run.id);
    throw error;
  }
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
    await admin.from("marketplace_products").upsert({ marketplace_id: marketplaceId, product_id: product.id, marketplace_sku: item.sellerSku, asin: item.asin ?? null }, { onConflict: "marketplace_id,marketplace_sku" });
    const { error: itemError } = await admin.from("order_items").upsert({ order_id: savedOrder.id, product_id: product.id, marketplace_item_id: item.externalItemId, title_snapshot: item.title, sku_snapshot: item.sellerSku, variation: item.variation ?? null, quantity: item.quantity }, { onConflict: "order_id,marketplace_item_id" });
    if (itemError) throw new Error(itemError.message);
  }
}

function safeError(error: unknown) { return error instanceof Error ? error.message.slice(0, 500) : "Marketplace sync failed."; }

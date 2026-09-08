# Database

The initial migration is `supabase/migrations/20260907140220_initial_reyo_pack_schema.sql`.

## Core model

- Identity: `profiles`, `user_roles`
- Inventory: `warehouses`, `locations`, `products`, `product_images`, `product_barcodes`
- Commerce: `marketplaces`, `marketplace_products`, `orders`, `order_items`
- Operations: `devices`, `packing_events`, `sync_runs`, `cleanup_runs`
- Configuration: `marketplace_integrations`, `system_settings`
- Long-term anonymous reporting: `daily_aggregate_metrics`

Each external order is unique by marketplace plus marketplace order ID. Each order has at most one packing event. Product SKUs, barcodes, AWBs, order numbers, marketplace IDs, state timestamps, worker IDs, and activity timestamps have targeted indexes; product title and ASIN use trigram indexes for admin search.

## Database functions

- `lookup_order(text)` — exact indexed worker lookup with no scan logging
- `get_order_detail(uuid)` — full order projection
- `pack_order(uuid, text, text)` — locked, atomic, idempotent packing transition
- `admin_search_orders(text, integer)` — bounded indexed admin search
- `import_orders(jsonb)` — validates and imports CSV rows transactionally
- `purge_expired_operational_data()` — archives aggregates and removes eligible terminal records

All functions revoke default public execution and explicitly grant only required roles. Helper functions live in a non-exposed `private` schema with a fixed empty search path.

## Invariants

- Active orders are never removed by retention.
- Packing attribution comes from `auth.uid()`, never from the browser.
- The first committed packing event owns the permanent worker and timestamp.
- Foreign keys cascade dependent order items/events during terminal-record cleanup.
- Marketplace sync and CSV import upsert stable natural keys rather than duplicating orders.

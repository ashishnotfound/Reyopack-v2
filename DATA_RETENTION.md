# Data retention

Reyo Pack keeps active orders indefinitely and removes terminal operational data only after the configured window, never sooner than seven full days.

## Eligible rows

- `packed` orders whose `packed_at` is older than the retention cutoff
- `cancelled` orders whose `cancelled_at` is older than the cutoff
- completed sync-run detail older than the cutoff
- stale device/session metadata whose last use is older than the cutoff
- temporary label objects stored under an eligible order-ID prefix

Pending, ready, processing, and otherwise active orders are never eligible, regardless of age. Product catalog, locations, warehouses, accounts, and configuration remain.

Before removing packed orders, cleanup rolls non-PII counts into `daily_aggregate_metrics` by date, worker key, marketplace, and SKU. Referential cascades remove the dependent items and event. Product artwork is retained because it belongs to catalog products, not completed orders.

## Schedule and monitoring

Supabase Cron invokes `purge_expired_operational_data()` daily at 02:15 UTC. Admins can run and inspect cleanup from `/admin/retention`. Every run writes status and deletion counts to `cleanup_runs`; failures preserve a bounded error message.

Changing `retention_days` below 7 has no effect because the database enforces the minimum. Coordinate longer retention with privacy, storage, and reporting requirements.

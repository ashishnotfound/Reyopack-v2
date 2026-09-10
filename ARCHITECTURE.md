# Architecture

## Critical packing path

1. `/pack` accepts the printed AWB or decodes the long AWB barcode locally from the rear camera or a selected photo.
2. `GET /api/orders/lookup` validates and normalizes the AWB before calling the indexed `lookup_order` database function.
3. The worker checks product artwork, SKU, quantity, variation, marketplace, and warehouse location.
4. `POST /api/orders/:id/pack` validates the device payload and calls the atomic `pack_order` function.
5. Postgres locks the order row, inserts the unique packing event, updates the order, and returns the server-owned worker and timestamp.
6. The UI shows success only after that transaction commits. Realtime updates the admin activity table.

The unique constraint on `packing_events.order_id` and row lock make concurrent confirmation idempotent. A later AWB lookup is still allowed and returns the original attribution without creating a second event.

## Application boundaries

- Server Components load authenticated operational data.
- Client Components are limited to AWB entry, forms, local device preferences, and Realtime subscriptions.
- Supabase browser clients use the public publishable key and RLS. Secret-key clients exist only in server-only modules for integration and account administration.
- Marketplace adapters normalize external data before the sync service upserts natural keys.
- Development fixtures are reachable only when `REYO_PACK_DEMO_MODE` is exactly `true`.

## Routes

- Worker: `/pack`
- Authentication: `/login`, `/forgot-password`, `/reset-password`, `/auth/callback`
- Admin: `/admin`, `/admin/activity`, `/admin/orders`, `/admin/products`, `/admin/workers`, `/admin/locations`, `/admin/integrations`, `/admin/sync`, `/admin/orders/import`, `/admin/reports`, `/admin/retention`, `/admin/system-health`, `/admin/settings`
- Automation/API: `/api/cron/sync`, `/api/admin/sync`, `/api/admin/orders/import`, `/api/orders/lookup`, `/api/orders/:id/pack`

## Design choices

- Lookup and pack operations are database functions so correctness does not depend on one browser or server instance.
- Product artwork and temporary labels use private Storage buckets with signed access.
- Completed operational rows are short-lived; daily aggregate metrics survive cleanup.
- The application is multi-warehouse at the schema level while the UI defaults to Reyo Store's main warehouse.

# Amazon Selling Partner API

The production adapter uses the current Orders API `v2026-01-01` `searchOrders` operation. It requests fulfillment and package data, follows pagination tokens, keeps the last successful marketplace update checkpoint, and retries HTTP 429/5xx responses with bounded backoff.

## Configure in the app

A Super Admin can open **Integrations → Amazon SP-API credentials** and enter:

- Login with Amazon (LWA) client ID
- LWA client secret
- LWA refresh token
- Regional SP-API endpoint
- One or more marketplace IDs

Reyo Pack verifies the LWA credentials and tests the selected marketplace IDs against the Orders API before saving them. The values are encrypted in Supabase Vault, are never returned to the browser, and are loaded on every new sync without restarting the app. Leave a saved secret field blank when updating the other settings to keep its existing value.

India uses the **Europe, Middle East & India** endpoint (`https://sellingpartnerapi-eu.amazon.com`). The Far East endpoint is for Japan, Australia, and Singapore.

Do not paste the short-lived LWA access token. Reyo Pack exchanges the saved refresh token for a fresh access token automatically and caches it only until shortly before expiry.

## Optional environment fallback

- `AMAZON_SP_API_ENDPOINT` — regional endpoint such as `https://sellingpartnerapi-eu.amazon.com`
- `AMAZON_SP_API_CLIENT_ID`
- `AMAZON_SP_API_CLIENT_SECRET`
- `AMAZON_SP_API_REFRESH_TOKEN`
- `AMAZON_SP_API_MARKETPLACE_IDS` — comma-separated marketplace IDs

These server-only variables are used only when no active Vault configuration exists. The browser never receives them.

## Synchronization

- Supabase Cron invokes the deployed `/api/cron/sync` endpoint every 30 minutes using the matching `CRON_SECRET` stored in Supabase Vault.
- An admin can trigger the same service from `/admin/sync`.
- Successful runs persist their checkpoint in `sync_runs`; failed runs keep a bounded error summary.
- Orders, catalog products, marketplace listings, items, tracking/AWB values, and state are upserted by stable keys.
- Cancelled external orders become terminal `cancelled` rows. Already packed attribution is never overwritten.

Amazon credentials and app authorization must be provisioned in Seller Central before the adapter can make live requests. Validate the selected regional endpoint and marketplace IDs during rollout.

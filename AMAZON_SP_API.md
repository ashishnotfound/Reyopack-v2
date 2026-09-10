# Amazon Selling Partner API

The production adapter uses the current Orders API `v2026-01-01` `searchOrders` operation. It requests fulfillment and package data, follows the nested `pagination.nextToken` value until Amazon returns no token, keeps the last successful marketplace update checkpoint, and retries HTTP 429/5xx responses with bounded backoff.

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
- Admins and workers can trigger the same service with **Sync Orders**.
- The initial sync covers Amazon's supported two-year search window. Later runs use a small overlap around the last successful UTC checkpoint so late updates and midnight boundaries are not skipped.
- Every paginated request keeps the original marketplace and date-window parameters and adds Amazon's pagination token. There is no application-level maximum order count.
- The checkpoint advances only after the complete window succeeds, never between pages.
- Successful runs persist fetched, added, updated, unchanged, failed, and page counts in `sync_runs`. Request and per-order failures are recorded in `sync_failures` for the admin sync log.
- Orders, catalog products, marketplace listings, items, tracking/AWB values, and state are upserted by stable keys.
- Existing orders are refreshed when Amazon provides newer data; an older response cannot overwrite a newer stored version.
- Order identity is the Amazon marketplace plus Amazon order ID. AWBs are indexed for fast lookup but are not treated as globally unique, because one tracking number can legitimately cover separate orders.
- Cancelled external orders become terminal `cancelled` rows. Already packed attribution is never overwritten.

The packing counters are calculated from the synced database, not from the current page of the order list. They exclude cancelled or unfulfillable orders and Amazon-fulfilled (FBA) orders because those do not belong in the merchant packing workflow.

Amazon credentials and app authorization must be provisioned in Seller Central before the adapter can make live requests. Validate the selected regional endpoint and marketplace IDs during rollout.

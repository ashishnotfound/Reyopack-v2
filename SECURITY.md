# Security

## Access model

- `worker`: packing workstation and own packing activity
- `admin`: operational dashboards, orders, catalog, locations, workers, sync, reports, and cleanup
- `super_admin`: admin permissions plus role/configuration changes and integration records

Roles are stored in `user_roles` and checked by RLS/database functions. Display names may originate in Auth user metadata during account creation; authorization never does.

## Controls

- Open sign-up is disabled and protected layouts enforce authenticated, active profiles.
- Session cookies are refreshed by Next.js proxy middleware and protected responses are private/no-store.
- Browser clients hold only the publishable Supabase key. Secret-key and marketplace credentials are server-only; Amazon credentials saved in the app are encrypted in Supabase Vault.
- Amazon credential read/write database functions are executable only by the server service role, and every credential update re-authorizes the caller as a Super Admin.
- Every exposed table uses RLS plus explicit grants. Public and anonymous access are revoked.
- Packing uses authenticated database identity, a row lock, and a unique order constraint.
- Product artwork and labels are in private buckets; image uploads validate MIME type and size.
- Inputs are bounded and validated with Zod or database constraints.
- The Amazon adapter applies bounded retries for throttling/transient errors and never logs tokens.
- Pages send `noindex` metadata; production should also sit behind organization/network access controls where available.

## Operations

Rotate Supabase and Amazon secrets immediately after suspected exposure. Disable the affected user from the Workers screen to revoke sessions. Review `sync_runs`, `cleanup_runs`, Vercel logs, and packing activity for anomalies. Do not put customer address data into packing events or aggregate metrics.

Before production, configure platform-level monitoring and alerting for repeated sync failures, cron authorization failures, database capacity, and unusual authentication traffic.

# Deployment

## Prerequisites

- A migrated Supabase project with Authentication, Realtime, Storage, Cron, and `pg_net` enabled
- An Amazon Selling Partner application and refresh token when live Amazon sync is required
- A Vercel project connected to this repository

## Vercel variables

Set these separately for Production and Preview as appropriate:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL`
- `CRON_SECRET`
- All `AMAZON_*` variables documented in `AMAZON_SP_API.md`
- `REYO_PACK_DEMO_MODE=false`

## Release checklist

1. Run `npm ci` and `npm run verify`.
2. Reset a disposable Supabase database and run `npm run test:db`.
3. Run `npm run test:e2e` with demo mode, then again against a staging Supabase project for authentication/RLS coverage.
4. Apply database migrations before promoting the matching application build.
5. Deploy to Vercel, then store the production HTTPS URL as `reyo_pack_app_url` and the matching `CRON_SECRET` as `reyo_pack_cron_secret` in Supabase Vault.
6. Confirm `/login`, a worker scan/pack, admin activity Realtime, manual sync, cron authorization, and retention status.
7. Verify the production site URL and callback allow-list in Supabase Auth.
8. Confirm demo mode is false and no secrets appear in browser bundles or logs.

Supabase Cron defines the half-hourly sync schedule and calls the deployed application over HTTPS. The database retention schedule is also managed in Supabase and is independent of Vercel Cron limits.

## Rollback

Promote the previous Vercel deployment for application-only regressions. Database migrations should be forward-fixed; take a Supabase backup before destructive schema changes. Do not roll back packing events or overwrite first-pack attribution.

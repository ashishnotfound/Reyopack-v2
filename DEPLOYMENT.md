# Deployment

## Prerequisites

- A migrated Supabase project with Authentication, Realtime, Storage, and Cron enabled
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
5. Deploy to Vercel and confirm `/login`, a worker scan/pack, admin activity Realtime, manual sync, cron authorization, and retention status.
6. Verify the production site URL and callback allow-list in Supabase Auth.
7. Confirm demo mode is false and no secrets appear in browser bundles or logs.

`vercel.json` defines the half-hourly sync schedule. Database retention is scheduled inside Supabase and is independent of Vercel availability.

## Rollback

Promote the previous Vercel deployment for application-only regressions. Database migrations should be forward-fixed; take a Supabase backup before destructive schema changes. Do not roll back packing events or overwrite first-pack attribution.

# Supabase setup

## Local

1. Install Docker Desktop and run `npx supabase start`.
2. Run `npx supabase db reset` to apply migrations and `supabase/seed.sql`.
3. Copy the local API URL, publishable key, and secret key into `.env.local`.
4. Set `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
5. Create the first account with the `admin:create` script described in the README.

## Hosted project

1. Create a Supabase project in the same region as the Vercel deployment where practical.
2. Set the percent-encoded direct connection as `SUPABASE_DB_URL`, link the CLI, and apply migrations with `npx supabase db push`. Use `sslmode=verify-full`; the public Supabase Root 2021 CA used by the database test runner is stored in `supabase/certs`. Add its absolute, URL-encoded path as `sslrootcert` when the CLI cannot find the CA in the system trust store.
3. In Authentication URL configuration, set the production site URL and add `/auth/callback` for preview/production origins.
4. Keep user sign-up disabled. Administrators create worker accounts from Reyo Pack.
5. Confirm the private `product-artwork` and `temporary-labels` buckets and the Realtime publication created by the migration.
6. Store the project URL, publishable key, and secret key only in the corresponding deployment environments.

The 2026 Supabase API defaults require explicit table grants in addition to RLS; the migration contains both. Never expose `SUPABASE_SECRET_KEY` or `SUPABASE_DB_URL` through a `NEXT_PUBLIC_` variable.

## Schema changes

Create each change with `npx supabase migration new meaningful_name`, edit the generated SQL, reset locally, run pgTAP, then push through the deployment pipeline. Do not make untracked dashboard-only schema changes.

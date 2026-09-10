# Reyo Pack

Reyo Pack is Reyo Store's internal, AWB-first warehouse packing application. Workers enter the AWB printed on an Amazon shipping label, confirm the product and pick location, and mark the order packed. The database records one immutable packing event per order with authenticated worker attribution.

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, and Lucide
- Supabase Auth, Postgres, Realtime, Storage, Row Level Security, and Cron
- Amazon Selling Partner API Orders v2026-01-01 plus transactional CSV import
- Vitest, pgTAP, and Playwright
- Vercel-ready deployment and scheduled sync configuration

## Local setup

1. Install Node.js 22 or newer, Docker Desktop, and dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and enter the local Supabase values.
3. Run `npx supabase start`, then `npx supabase db reset`.
4. Create the first super admin with `npm run admin:create -- admin@example.com a-strong-password "Admin Name"`.
5. Start the app with `npm run dev` and open `http://localhost:3000`.

For a UI-only local demonstration, set `REYO_PACK_DEMO_MODE=true`. Demo mode is intentionally explicit and must remain false in production.

## Quality gates

Run `npm run verify` for type checking, linting, unit tests, and a production build. Run `npm run test:e2e` for desktop and mobile Chromium workflows. `npm run test:db` uses `SUPABASE_DB_URL` when configured and otherwise checks the local Supabase database; its fixtures and assertions run inside a rolled-back transaction.

## Documentation

- [Architecture](./ARCHITECTURE.md)
- [Database](./DATABASE.md)
- [Supabase setup](./SUPABASE.md)
- [Security](./SECURITY.md)
- [Amazon SP-API](./AMAZON_SP_API.md)
- [Data retention](./DATA_RETENTION.md)
- [Deployment](./DEPLOYMENT.md)
- [Testing](./TESTING.md)
- [Admin guide](./ADMIN_GUIDE.md)
- [Worker guide](./WORKER_GUIDE.md)

The application is for private operational use. Do not expose it to public indexing or enable open sign-up.
"# Reyopack-v2" 

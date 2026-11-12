# Reyo Pack

Reyo Pack is Reyo Store's internal, AWB-first warehouse packing application. Workers enter the AWB printed on an Amazon shipping label, confirm the product and pick location, and mark the order packed. The database records one immutable packing event per order with authenticated worker attribution.

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, and Lucide
- Supabase Auth, Postgres, Realtime, Storage, Row Level Security, and Cron
- Amazon Selling Partner API Orders v2026-01-01 plus transactional CSV import
- Vitest, pgTAP, and Playwright
- Vercel-ready deployment and scheduled sync configuration

## Local setup

1. Install Node.js 22.13 or newer, Docker Desktop, and dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and enter the local Supabase values.
3. Run `npx supabase start`, then `npx supabase db reset`.
4. Create the first super admin with `npm run admin:create -- admin@example.com a-strong-password "Admin Name"`.
5. Start the app with `npm run dev` and open `http://localhost:3000`.

For a UI-only local demonstration, set `REYO_PACK_DEMO_MODE=true`. Demo mode is intentionally explicit and must remain false in production.

## Quality gates

Run `npm run verify` for type checking, linting, unit tests, and a production build. Run `npm run test:e2e` for desktop and mobile Chromium workflows. `npm run test:db` uses `SUPABASE_DB_URL` when configured and otherwise checks the local Supabase database; its fixtures and assertions run inside a rolled-back transaction.

## Android app

The Capacitor Android app uses package ID `com.reyo.pack` and opens the same HTTPS production Reyo Pack service as the web app, so workers share the existing Supabase authentication, orders, and realtime data. No server credentials are bundled into the APK.

Requirements: Node.js 22+, JDK 21, and Android Studio with Android SDK 36. Install dependencies with `npm install`, then run `npm run android:sync` and `npm run android:open`. Build an installable debug APK with `npm run android:apk`; the output is `android/app/build/outputs/apk/debug/app-debug.apk`.

The default hosted URL is `https://reyopack-v2.vercel.app/pack`. Set `CAPACITOR_SERVER_URL` to another HTTPS deployment before `npm run android:sync` when targeting a different environment. Camera scanning requires Android camera permission and a reachable HTTPS deployment.

For a signed release, copy `android/keystore.properties.example` to `android/keystore.properties`, point it at a private keystore, fill in the local signing values, and run `npm run android:bundle` (or `cd android && gradlew bundleRelease`). Signing files and passwords are ignored by Git.

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
- [Ship Today, scanning and PDF label printing](./SHIPPING_WORKFLOW.md)

The application is for private operational use. Do not expose it to public indexing or enable open sign-up.
"# Reyopack-v2" 

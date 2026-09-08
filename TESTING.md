# Testing

## Automated suites

- `npm run typecheck` — TypeScript contracts
- `npm run lint` — Next.js/React and security lint rules
- `npm test` — 13 packing, rescan, retention-boundary, marketplace-state, image-signature, and validator unit tests
- `npm run test:db` — pgTAP schema, RLS, exact lookup, atomic idempotency, and retention tests over a direct PostgreSQL connection
- `npm run test:e2e` — 14 desktop and mobile Chromium scanner and admin workflows
- `npm run build` — production compilation and route validation

The E2E suite covers every admin route, normal packing and activity updates, 20 harmless rescans, already-packed attribution, rapid double-click and concurrent confirmations producing one new event, and an offline confirmation that must not show success. It also fails on browser console errors and Next.js error overlays.

The database suite reads `SUPABASE_DB_URL` from the environment or `.env.local`. When it is absent, it defaults to the local Supabase database on port 54322. Hosted Supabase connections use the bundled public Supabase Root 2021 CA with certificate and hostname verification. Test fixtures, packing events, and cleanup records are contained in one transaction and rolled back after the assertions.

## Manual acceptance

Use a staging project and two distinct worker sessions:

1. Scan the same unpacked order repeatedly and confirm no warning, lockout, or activity record is created.
2. Pack it from both sessions at nearly the same time; confirm one event and one permanent worker/timestamp.
3. Scan the packed order again and confirm product/location remain visible and the action is disabled.
4. Confirm admin activity updates without refresh and links to order detail.
5. Disable a worker and confirm their active sessions are revoked.
6. Run a marketplace sync twice and confirm natural-key upserts create no duplicate order.
7. Create terminal records around the seven-day boundary and confirm only records older than the cutoff are removed.

Never run destructive retention tests against production.

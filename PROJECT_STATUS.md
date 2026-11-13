# Reyo Pack implementation and verification status

## Testing release

Testing branch: `codex/a55-scanner-testing`. Production branch: `main`; do not merge/promote until the device test is reviewed. This branch includes the scanner fixes and the previously implemented shipping/PDF features on which the tested build is based. A preview deployment does not establish physical-device compatibility or overall project completion.

| Area | Implemented | Evidence | Still required |
| --- | --- | --- | --- |
| Camera/AWB scanner | 1080p preference with fallbacks, actual settings checks, resolution-preserving controls, full-size decoder frames, diagnostics and camera recovery | 49 unit tests and 34 desktop/mobile Chromium browser tests passed for the complete build; synthetic video exercises resolution changes and torch/refocus constraint handling | Physical Samsung A55, Samsung Internet/other device-browser checks, real-label recognition and sustained-use latency/thermal testing |
| Ship Today | Database-backed dated queues, pagination, bulk selection, persisted/shared batches, scan metadata and explicit physical carrier handover | Database migration applied; all 86 database assertions passed at rollout; browser regressions cover batch selection, reload, filters and handover errors | Operational acceptance with real orders and pickups; no Amazon shipment-confirmation integration is implemented |
| Mobile/web synchronization | Shared Supabase orders, packing attribution, scans, batches and handovers; Realtime plus refresh fallback where implemented | Workload browser regression confirms another worker's packing is reflected without manual refresh; database atomic/idempotent write tests passed | Two physical devices against the deployed version; Seller Central workload/count reconciliation and extended network-recovery testing |
| PDF label arranger | Local PDF processing, separate-invoice filtering, conservative duplicate detection, uncertain-page review, 1/4-per-A4 preview/download and Android sharing integration | 20-page supplied reference reconstructed pixel-identically; matching 160-page source gave 74 recognized labels, 81 excluded invoices and five review regions; synthetic browser/unit tests and APK build passed | Physical printing/barcode readability, wider original Amazon PDF coverage and on-device native PDF sharing |

Type checking, ESLint and the optimized production build pass. No physical A55 fix is claimed. Scanner-specific findings and on-device diagnostics are documented in [SCANNER_QUALITY.md](SCANNER_QUALITY.md); workflow/PDF limits are documented in [SHIPPING_WORKFLOW.md](SHIPPING_WORKFLOW.md).

## A55 test record

Device results are pending. Capture browser/WebView version, actual stream and decoder resolutions, selected lens, reported focus/exposure settings, processing duration, failed/successful attempts and reproducible recovery steps. Do not attach customer labels, addresses or raw AWBs to public issues or repository fixtures.

The HTTPS preview URL and its verification status must be recorded only after the deployment is ready. Preview app authentication remains required. Confirm which Supabase project the preview uses before packing or syncing real orders; a preview URL does not itself isolate database writes.

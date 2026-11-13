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

## HTTPS test deployment

Vercel/GitHub reports the following immutable deployment successful in the **Preview** environment:

- URL: https://reyopack-v2-7qpt8mj47-reyoeclipse-4459s-projects.vercel.app/pack
- Deployed commit: `70f46e5e7b7f9c8df9e1bbfb3e895a6316015859` (includes scanner code through `9fed720`).
- Production remains on `439faf526279c67b41d9f5b670ba222562081c86`; no production promotion or main-branch push was performed.
- Source/deployment provenance confirms the diagnostic component is included. Deployed runtime/visible-panel verification is pending Vercel Authentication: the connector cannot access this project, the CLI has a different account, and the browser is awaiting the owner sign-in. Protection has not been disabled.

Preview app authentication also remains required. The preview database configuration has not been inspected. Treat packing, sync, handover and scan metadata as real writes unless isolation is confirmed; a preview URL does not itself isolate the database.

### Practical A55 checklist

1. Open the exact HTTPS preview in Chrome, then Samsung Internet. Sign into Vercel if prompted, then Reyo Pack. Confirm **Scan AWB → Scanner diagnostics** exists.
2. Open the camera with the main rear lens. Record actual stream resolution, decoder canvas resolution, FPS, camera name, reported focus/exposure and processing time. Preferred is 1920×1080; record any fallback rather than assuming it was granted. Repeat after portrait/landscape rotation.
3. Test a known AWB at several distances in good diffuse light. Record time to detection and misses. Exactly one order should load per scan. Avoid the square codes. Scanning records metadata but does not mark Packed.
4. Toggle torch and Refocus where supported. Confirm the picture remains usable and actual resolution does not unexpectedly drop. Record unreported/unsupported controls honestly.
5. Scan ten orders consecutively and deliberately rescan the same AWB. Check for duplicate submissions, wrong orders or a stuck camera. Test automatic next-camera mode only while performing genuine packing; do not mark real orders Packed merely for testing.
6. Close/reopen, switch apps and return, lock/unlock, and test permission deny/allow. Retry should recover with no persistent black preview or busy-camera failure. Note exact steps if it does not.
7. Repeat a small sample on desktop Chrome/Edge and another available phone. Automated Chromium tests are not proof of Safari, Samsung Internet, or physical-camera compatibility.

Share browser version and diagnostic readings, not customer addresses, complete label photos or raw AWBs. Physical-device results remain pending.

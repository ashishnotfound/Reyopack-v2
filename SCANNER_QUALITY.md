# Camera scanning quality

The scanner prefers 1920×1080 at 30 FPS, then 1280×720, then the camera's defaults. These are preferences, not claimed measurements. An explicitly chosen lens is retained throughout fallback. After acquisition, `getSettings()` is checked; an actual stream below 720p gets bounded resolution-upgrade attempts on the same track. Unsupported upgrades leave the working stream usable and show a warning.

Supported continuous autofocus and automatic exposure are requested independently. Neither manual focus distance nor manual exposure is forced. Refocus and torch are optional; unsupported controls cannot make camera startup fail. Every control change preserves existing resolution/device constraints: `applyConstraints()` replaces constraints rather than merging them ([API reference](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/applyConstraints)). The previous autofocus/torch calls could discard the resolution preference. Whether that caused a specific A55 failure still requires a device measurement.

ZXing and the existing barcode formats are retained. The decoding canvas uses intrinsic `videoWidth`/`videoHeight`, not the CSS preview size, and is resized/redrawn 1:1 when intrinsic dimensions change. The preview uses contain rather than cover, so a label visible to the worker is not cropped just to fill the UI. No thumbnail, lossy recompression, or preview screenshot is used for decoding. Retries remain serial with a 100 ms gap after decoding; valid AWBs are delivered immediately. Rejected non-AWB decodes also wait 100 ms instead of spinning in a zero-delay loop.

## On-device investigation

Open **Scan AWB → Scanner diagnostics** on the affected phone using HTTPS. It reports the camera label/facing, actual track dimensions/FPS, decoder canvas dimensions, supported and reported focus/exposure settings, focus distance/range when available, control failures, attempt counts, decoder outcomes and processing duration. Unsupported settings are shown as unreported, not assumed successful. Counts include only outcomes surfaced by ZXing; some internal format/checksum failures can be surfaced as not-found.

No frames, raw barcode contents, stable device IDs or diagnostics are uploaded/logged. Diagnostics update at most once per second except an unexpected decoder error. Such errors stop the camera and offer retry rather than silently leaving a frozen scanner.

The dialog scrolls without compressing the video into the controls when diagnostics are expanded. Shutdown also handles ZXing's optional asynchronous torch-off rejection after a track has already stopped; track cleanup still completes.

For the A55, record the browser/WebView version and photograph the diagnostics (without customer details). Compare actual stream and decoder dimensions before/after Light on and Refocus. Try the main rear lens, diffuse light without glare, and several distances around 15–30 cm; move back if too close to focus. Test repeated scans, portrait/landscape, permission denial, closing/reopening, background/resume, and sustained packing. A sharp preview alone does not prove barcode decode reliability.

## Automated evidence and limits

- Final checks: all 49 unit tests and all 34 desktop/mobile browser tests passed; type checking, ESLint and the optimized production build passed. The mobile diagnostic layout was visually inspected using a synthetic camera scene.
- Unit regressions cover 1080p preference, 720p fallback, lens preservation, actual 640×480 grant repair, denied permission, late stream cleanup, optional-control failures/timeouts, and preserving resolution/focus while changing lighting.
- Desktop Chromium and mobile Chromium emulation use real synthetic Code 128 video frames. They exercise 640×480 → 1920×1080 upgrade, refused upgrades with continued decoding, focus/torch constraint replacement, portrait frame changes to 1080×1920, full-size processing despite a small CSS preview, one lookup per scan, and deliberate repeated/automatic scans.
- No Galaxy A55 or other physical phone was connected. Samsung Internet, device autofocus behavior, real-camera sharpness, thermal load and real-device scan latency remain unverified. Synthetic browser results do not establish universal phone compatibility.
- These web changes are local until deployed; the hosted Android wrapper does not receive them from a local build. No native plugin, database, order-sync or packing-state change is required. Rollback is a source revert of the scanner changes, without database migration.

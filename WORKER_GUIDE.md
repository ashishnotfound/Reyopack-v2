# Worker guide

1. Sign in and open the packing workstation.
2. Use **Camera** on a phone, or keep the scanner cursor in the scan field when using a handheld scanner. Scan an AWB, order identifier, or product SKU and press Enter if the scanner does not send Enter automatically.
3. Match the product artwork, title, SKU, variation, quantity, marketplace, and rack/shelf/bin before packing.
4. Select **PACKED** only after the parcel is complete.
5. Wait for the green server-confirmed screen, worker name, and timestamp before moving to the next parcel.

You may scan the same order as many times as needed. Looking up an order never marks it packed and never creates packing activity.

If an order is already packed, Reyo Pack still shows the product and location, plus who packed it and when. The packing action stays disabled. Ask an admin to investigate discrepancies; do not try to work around the state.

If **CONNECTION LOST** appears, stop and restore the connection. Reyo Pack will not report a successful pack while the server is unreachable. Use Escape to clear the current order and return focus to the scanner.

The sound toggle is stored only on the current device. It does not affect packing records.

## Phone camera

- On an HTTPS address, select **Camera → Start rear camera** for continuous barcode scanning.
- On a plain local-network HTTP address, select **Camera → Take barcode photo**. Mobile browsers block live camera streams on non-secure pages, but the photo fallback still decodes the barcode locally.
- Fill the scan frame with one barcode, hold the phone steady, and avoid glare.
- Camera frames and selected photos stay on the device and are not uploaded.

# Worker guide

1. Sign in and open the packing workstation.
2. Select **Scan AWB**, start the rear camera, and aim only at the single long barcode above the printed AWB number. Do not aim at the square codes lower on the label. You can also enter the printed AWB and press Enter.
3. Match the product artwork, title, SKU, variation, quantity, marketplace, and rack/shelf/bin before packing.
4. Select **PACKED** only after the parcel is complete.
5. Wait for the green server-confirmed screen, worker name, and timestamp before moving to the next parcel.

You may search the same AWB as many times as needed. Looking up an order never marks it packed and never creates packing activity.

If an order is already packed, Reyo Pack still shows the product and location, plus who packed it and when. The packing action stays disabled. Ask an admin to investigate discrepancies; do not try to work around the state.

If **CONNECTION LOST** appears, stop and restore the connection. Reyo Pack will not report a successful pack while the server is unreachable. Use Escape to clear the current order and return focus to the AWB field.

The sound toggle is stored only on the current device. It does not affect packing records.

On HTTPS, the rear camera scans continuously. If camera access is unavailable, select **Take AWB photo** and fill the image with the long barcode. The barcode is decoded on the device and the photo is not uploaded. The manual field also accepts a pasted label such as `AWB 3723 8571 2343`; spaces and the printed `AWB` prefix are removed automatically before searching.

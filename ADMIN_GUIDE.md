# Admin guide

## Daily operations

- Dashboard shows today's total, packed, remaining, cancelled, active workers, output, and recent activity.
- Activity updates live while the page is open. Select an order identifier to inspect the complete packing record.
- Orders supports indexed search by order ID, marketplace ID, AWB, SKU, ASIN, or product title.
- Products manages SKUs, barcodes, warehouse locations, and private artwork.
- Workers creates invite-only accounts, assigns roles, disables access, and revokes sessions.
- Locations maintains warehouse rack, shelf, and bin codes.

## Import and synchronization

Use Sync for marketplace status and recent run history. Use CSV Import only for supported manual sources. The importer requires the documented headers, previews validation errors and duplicates, and commits valid rows in one database transaction.

Amazon credentials are configured as deployment secrets, never pasted into an admin browser page. A development adapter is shown only when explicit demo mode is enabled.

## Retention and health

Retention shows the enforced window, last cleanup, next cleanup, and deletion count. Manual cleanup is safe for active orders but should still be run during a quiet period. System Health summarizes environment, database, marketplace, and cleanup readiness; deployment logs remain the detailed operational record.

If a worker reports a false success, do not edit the order manually. Inspect the packing event and server logs first; the UI is designed to show success only after the database commits.

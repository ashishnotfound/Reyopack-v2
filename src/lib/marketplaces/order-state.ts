export type SyncedOrderState = "pending" | "packed" | "cancelled";

export function resolveSyncedOrderState(existing: SyncedOrderState | null | undefined, marketplaceStatus: string): SyncedOrderState {
  if (existing === "packed" || existing === "cancelled") return existing;
  return marketplaceStatus.toUpperCase() === "CANCELLED" ? "cancelled" : "pending";
}

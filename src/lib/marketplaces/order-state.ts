export type SyncedOrderState = "pending" | "packed" | "cancelled";

export function resolveSyncedOrderState(existing: SyncedOrderState | null | undefined, marketplaceStatus: string): SyncedOrderState {
  if (marketplaceStatus.toUpperCase() === "CANCELLED") return "cancelled";
  if (existing === "packed" || existing === "cancelled") return existing;
  return "pending";
}

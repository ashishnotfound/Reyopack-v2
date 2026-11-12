import type { PackOrder } from "@/types/domain";
export type ShippingOrder = PackOrder & {
  scannedAt?: string | null;
  marketplaceStatus?: string | null;
  carrierHandoverAt?: string | null;
};
export function isCancelledForDispatch(order: {
  state: string;
  marketplaceStatus?: string | null;
}) {
  return (
    order.state === "cancelled" ||
    ["CANCELLED", "UNFULFILLABLE"].includes(
      order.marketplaceStatus?.toUpperCase() ?? "",
    )
  );
}
export function shippingStatus(order: ShippingOrder) {
  if (isCancelledForDispatch(order)) return "Cancelled";
  if (
    ["SHIPPED", "DELIVERED"].includes(
      order.marketplaceStatus?.toUpperCase() ?? "",
    )
  )
    return "Amazon confirmed shipped";
  if (order.handedOver) return "Handed to carrier";
  if (order.state === "packed") return "Ready for dispatch";
  return order.scannedAt ? "Scanned · Unpacked" : "Unscanned · Unpacked";
}
export function batchEligible(order: ShippingOrder) {
  return (
    !isCancelledForDispatch(order) &&
    order.state === "pending" &&
    !order.handedOver &&
    Boolean(order.awb?.trim()) &&
    order.items.length > 0
  );
}

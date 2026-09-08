import { DEMO_ORDER, DEMO_USER } from "@/lib/demo-data";
import { DEMO_ACTIVITY } from "@/lib/demo-data";
import type { PackOrder, PackingActivity, PackingInfo } from "@/types/domain";

const demoState = globalThis as typeof globalThis & {
  __reyoPackDemoPacking?: PackingInfo;
};

export function getDemoOrder(query?: string): PackOrder | null {
  if (query) {
    const normalized = query.trim().toLowerCase();
    const values = [
      DEMO_ORDER.id,
      DEMO_ORDER.orderNumber,
      DEMO_ORDER.marketplaceOrderId,
      DEMO_ORDER.awb,
      DEMO_ORDER.items[0].sku,
    ].filter(Boolean) as string[];
    if (!values.some((value) => value.toLowerCase() === normalized)) return null;
  }

  const order = structuredClone(DEMO_ORDER);
  if (demoState.__reyoPackDemoPacking) {
    order.state = "packed";
    order.packing = demoState.__reyoPackDemoPacking;
  }
  return order;
}

export function packDemoOrder(): { order: PackOrder; alreadyPacked: boolean } {
  const alreadyPacked = Boolean(demoState.__reyoPackDemoPacking);
  demoState.__reyoPackDemoPacking ??= {
    id: "40000000-0000-4000-8000-000000000099",
    workerId: DEMO_USER.id,
    workerDisplayName: DEMO_USER.displayName,
    packedAt: new Date().toISOString(),
  };
  return { order: getDemoOrder()!, alreadyPacked };
}

export function resetDemoOrder() {
  delete demoState.__reyoPackDemoPacking;
}

export function getDemoActivity(): PackingActivity[] {
  const event = demoState.__reyoPackDemoPacking;
  if (!event) return DEMO_ACTIVITY;
  return [{
    id: event.id,
    workerDisplayName: event.workerDisplayName,
    workerId: event.workerId,
    orderId: DEMO_ORDER.id,
    orderNumber: DEMO_ORDER.orderNumber,
    marketplaceOrderId: DEMO_ORDER.marketplaceOrderId,
    productTitle: DEMO_ORDER.items[0].title,
    sku: DEMO_ORDER.items[0].sku,
    quantity: DEMO_ORDER.items[0].quantity,
    marketplace: DEMO_ORDER.marketplace,
    packedAt: event.packedAt,
  }, ...DEMO_ACTIVITY];
}

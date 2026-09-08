import type { OrderState } from "@/types/domain";

export function isRetentionEligible(
  order: { state: OrderState; packedAt?: string | null; cancelledAt?: string | null },
  now = new Date(),
  retentionDays = 7,
) {
  const terminalAt = order.state === "packed" ? order.packedAt : order.state === "cancelled" ? order.cancelledAt : null;
  if (!terminalAt) return false;
  return new Date(terminalAt).getTime() < now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
}

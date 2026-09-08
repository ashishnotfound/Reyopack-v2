import { describe, expect, it } from "vitest";
import { resolveSyncedOrderState } from "@/lib/marketplaces/order-state";

describe("marketplace state reconciliation", () => {
  it("marks a new cancelled marketplace order as cancelled", () => {
    expect(resolveSyncedOrderState(null, "CANCELLED")).toBe("cancelled");
  });

  it("never reopens a packed order during a later marketplace refresh", () => {
    expect(resolveSyncedOrderState("packed", "UNSHIPPED")).toBe("packed");
  });

  it("keeps cancellation terminal when a stale update arrives", () => {
    expect(resolveSyncedOrderState("cancelled", "PENDING")).toBe("cancelled");
  });
});

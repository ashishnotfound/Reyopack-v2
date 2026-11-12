import { describe, expect, it } from "vitest";
import { batchEligible, shippingStatus } from "@/lib/shipping";
import { DEMO_ORDER } from "@/lib/demo-data";
describe("shared shipping rules", () => {
  it("keeps physical handover separate from Amazon shipment confirmation", () => {
    expect(shippingStatus({ ...DEMO_ORDER, state: "packed" })).toBe(
      "Ready for dispatch",
    );
    expect(shippingStatus({ ...DEMO_ORDER, handedOver: true })).toBe(
      "Handed to carrier",
    );
    expect(
      shippingStatus({
        ...DEMO_ORDER,
        handedOver: true,
        marketplaceStatus: "SHIPPED",
      }),
    ).toBe("Amazon confirmed shipped");
    expect(
      shippingStatus({ ...DEMO_ORDER, state: "cancelled", handedOver: true }),
    ).toBe("Cancelled");
    expect(shippingStatus({...DEMO_ORDER,marketplaceStatus:'UNFULFILLABLE'})).toBe('Cancelled');
  });
  it("requires a pending package, products and AWB for batch eligibility", () => {
    expect(batchEligible(DEMO_ORDER)).toBe(true);
    for (const invalid of [
      { ...DEMO_ORDER, items: [] },
      { ...DEMO_ORDER, awb: null },
      { ...DEMO_ORDER, handedOver: true },
      { ...DEMO_ORDER, state: "packed" as const },
      { ...DEMO_ORDER, state: "cancelled" as const },
      { ...DEMO_ORDER, marketplaceStatus: 'UNFULFILLABLE' },
    ])
      expect(batchEligible(invalid)).toBe(false);
  });
});

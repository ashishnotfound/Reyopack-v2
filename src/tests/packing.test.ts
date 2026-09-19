import { beforeEach, describe, expect, it } from "vitest";
import { getDemoActivity, getDemoOrder, packDemoOrder, resetDemoOrder } from "@/lib/demo-runtime";

describe("atomic demo packing contract", () => {
  beforeEach(() => resetDemoOrder());

  it("allows unlimited lookup without creating packing events", () => {
    const before = getDemoActivity().length;
    for (let index = 0; index < 20; index += 1) {
      expect(getDemoOrder("408-1234567-1234567")?.state).toBe("pending");
    }
    expect(getDemoActivity()).toHaveLength(before);
  });

  it("records exactly one event across repeated pack requests", () => {
    const first = packDemoOrder();
    const second = packDemoOrder();
    expect(first.alreadyPacked).toBe(false);
    expect(second.alreadyPacked).toBe(true);
    expect(first.order.packing?.id).toBe(second.order.packing?.id);
    expect(getDemoActivity().filter((event) => event.orderId === first.order.id)).toHaveLength(1);
  });

  it("returns packed identity on a rescan", () => {
    packDemoOrder();
    const rescanned = getDemoOrder("AWB-REYO-24090701");
    expect(rescanned?.state).toBe("packed");
    expect(rescanned?.packing?.workerDisplayName).toBe("Reyo");
  });

  it("returns every product in a multi-product order", () => {
    const order = getDemoOrder("CHAINSAW-A4-05");
    expect(order?.items).toHaveLength(5);
    expect(order?.items.map((item) => item.title)).toEqual([
      "Spider-Man Poster",
      "Reze Poster",
      "Berserk Poster",
      "Gojo Poster",
      "Chainsaw Man Poster",
    ]);
    expect(order?.items.reduce((total, item) => total + item.quantity, 0)).toBe(9);
  });
});

import { describe, expect, it } from "vitest";
import { isRetentionEligible } from "@/lib/retention";

const now = new Date("2026-09-07T12:00:00.000Z");

describe("terminal-state retention", () => {
  it("keeps a packed record at six days", () => {
    expect(isRetentionEligible({ state: "packed", packedAt: "2026-09-01T12:00:00.000Z" }, now)).toBe(false);
  });
  it("expires a packed record older than seven days", () => {
    expect(isRetentionEligible({ state: "packed", packedAt: "2026-08-31T11:59:59.000Z" }, now)).toBe(true);
  });
  it("never expires an active old order", () => {
    expect(isRetentionEligible({ state: "pending", packedAt: "2020-01-01T00:00:00.000Z" }, now)).toBe(false);
  });
});

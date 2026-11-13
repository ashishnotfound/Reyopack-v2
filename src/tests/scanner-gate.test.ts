import { describe, expect, it } from "vitest";
import { ScanGate } from "@/lib/scanner-gate";

describe("consecutive scan ownership", () => {
  it("processes ten distinct labels without restarting and suppresses a held label", async () => {
    const gate = new ScanGate();
    const processed: string[] = [];
    for (let index = 0; index < 10; index++) {
      const code = `9900000000${String(index).padStart(2, "0")}`;
      expect(gate.begin(code)).toBe(true);
      processed.push(code); gate.finish();
      expect(gate.begin(code)).toBe(false);
    }
    expect(processed).toHaveLength(10);
    expect(gate.reason).toBe("same label held");
  });
  it("does not start a second lookup until the first settles, then accepts another code", () => {
    const gate = new ScanGate();
    expect(gate.begin("990000000001")).toBe(true);
    expect(gate.begin("990000000002")).toBe(false);
    expect(gate.reason).toBe("lookup in flight");
    gate.finish();
    expect(gate.begin("990000000002")).toBe(true);
  });
  it("releases failed lookups and supports deliberate retries without a permanent lock", () => {
    const gate = new ScanGate();
    expect(gate.begin("990000000001")).toBe(true);
    gate.finish(); // caller's finally, including not-found/network errors
    expect(gate.begin("990000000002")).toBe(true);
    gate.finish();
    expect(gate.begin("990000000002")).toBe(false);
    gate.retry();
    expect(gate.begin("990000000002")).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import { shouldPreferCamera } from "@/lib/scanner-camera";
import { cameraSnapshot, refocusCamera, tuneCamera } from "@/lib/scanner-quality";
import { frameSignal } from "@/lib/scanner-signal";

describe("lens, focus and detail recovery", () => {
  it("avoids speculative lens hops but prefers an identifiable main over macro/ultrawide/front", () => {
    expect(shouldPreferCamera("back main", "back ultra wide")).toBe(false);
    expect(shouldPreferCamera("back camera", "back camera 2")).toBe(false);
    expect(shouldPreferCamera("back macro", "back main")).toBe(true);
    expect(shouldPreferCamera("front", "rear main")).toBe(true);
    expect(shouldPreferCamera("back ultra wide", "rear main")).toBe(true);
  });
  it("does not assume unsupported focus, zoom or physical lenses exist", async () => {
    const track = { label: "Logical rear camera", getSettings: () => ({ width: 1920, height: 1080 }) } as unknown as MediaStreamTrack;
    expect(await tuneCamera(track)).toEqual([]);
    expect(cameraSnapshot(track)).toMatchObject({ focus: "unreported", zoomRange: null, camera: "Logical rear camera" });
    await expect(refocusCamera(track, new AbortController().signal)).rejects.toThrow("unavailable");
  });
  it("restores continuous focus after a supported single-shot sweep, preserving dimensions", async () => {
    vi.useFakeTimers();
    try {
      const applyConstraints = vi.fn().mockResolvedValue(undefined);
      const track = { getCapabilities: () => ({ focusMode: ["single-shot", "continuous"] }), getConstraints: () => ({ width: { ideal: 1920 }, height: { ideal: 1080 } }), applyConstraints } as unknown as MediaStreamTrack;
      const pending = refocusCamera(track, new AbortController().signal);
      await vi.advanceTimersByTimeAsync(601); await pending;
      expect(applyConstraints.mock.calls.map(([value]) => value)).toEqual([
        { width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: "single-shot" }] },
        { width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: "continuous" }] },
      ]);
    } finally { vi.useRealTimers(); }
  });
  it("rejects failed focus without stopping the track or changing a manual focus distance", async () => {
    const stop = vi.fn();
    const track = { getCapabilities: () => ({ focusMode: ["continuous"] }), applyConstraints: vi.fn().mockRejectedValue(new Error("unsupported")), stop } as unknown as MediaStreamTrack;
    await expect(refocusCamera(track, new AbortController().signal)).rejects.toThrow("unsupported");
    expect(stop).not.toHaveBeenCalled();
  });
  it("reports relative detail separately from resolution, not as a focus guarantee", () => {
    const pixels = (contrast: number) => new Uint8ClampedArray(Array.from({ length: 16 * 16 }, (_, i) => [i % 2 ? contrast : 0, i % 2 ? contrast : 0, i % 2 ? contrast : 0, 255]).flat());
    expect(frameSignal(pixels(255), 16, 16)!.edgeScore).toBeGreaterThan(frameSignal(pixels(30), 16, 16)!.edgeScore);
    expect(frameSignal(pixels(0), 16, 16)!.edgeScore).toBe(0);
  });
});

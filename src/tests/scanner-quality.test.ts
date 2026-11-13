import { describe, expect, it, vi } from "vitest";
import { tuneCamera, cameraSnapshot, applyCameraConstraint } from "@/lib/scanner-quality";

describe("measured camera quality", () => {
  it("preserves resolution and existing focus constraints when changing exposure or lighting", async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = { getConstraints: () => ({ width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: "continuous", torch: false }] }), applyConstraints } as unknown as MediaStreamTrack;
    await applyCameraConstraint(track, { advanced: [{ torch: true } as MediaTrackConstraintSet] });
    expect(applyConstraints.mock.calls[0][0]).toEqual({ width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: "continuous" }, { torch: true }] });
  });
  it("repairs an actual 640x480 grant and reports the granted settings, not the request", async () => {
    let width = 640;
    const applyConstraints = vi.fn<(constraints: MediaTrackConstraints) => Promise<void>>(async () => { width = 1920; });
    const track = { label: "back main", getSettings: () => ({ width, height: width === 640 ? 480 : 1080 }), getCapabilities: () => ({}), applyConstraints } as unknown as MediaStreamTrack;
    await tuneCamera(track);
    expect(applyConstraints.mock.calls[0][0]).toMatchObject({ width: { min: 1280, ideal: 1920 } });
    expect(cameraSnapshot(track)).toMatchObject({ camera: "back main", width: 1920, height: 1080 });
  });
  it("keeps a working low-resolution track when upgrades and optional controls fail", async () => {
    const track = { getSettings: () => ({ width: 640, height: 480 }), getCapabilities: () => ({ focusMode: ["continuous"], exposureMode: ["continuous"] }), applyConstraints: vi.fn().mockRejectedValue(new Error("unsupported")) } as unknown as MediaStreamTrack;
    const report = await tuneCamera(track);
    expect(report.some(line => line.includes("not applied"))).toBe(true);
    expect(cameraSnapshot(track).width).toBe(640);
  });
  it("does not force manual focus distance or exposure and configures supported automatic modes independently", async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = { getSettings: () => ({ width: 1920, height: 1080 }), getCapabilities: () => ({ focusMode: ["continuous"], exposureMode: ["continuous"], focusDistance: { min: 0, max: 10 } }), applyConstraints } as unknown as MediaStreamTrack;
    await tuneCamera(track);
    expect(applyConstraints.mock.calls.map(call => call[0])).toEqual([
      { advanced: [{ focusMode: "continuous" }] }, { advanced: [{ exposureMode: "continuous" }] },
    ]);
  });
  it("does not hang startup on a broken optional camera-control promise", async () => {
    vi.useFakeTimers();
    try {
      const track = { getSettings: () => ({ width: 1920, height: 1080 }), getCapabilities: () => ({ focusMode: ["continuous"] }), applyConstraints: () => new Promise(() => {}) } as unknown as MediaStreamTrack;
      const pending = tuneCamera(track);
      await vi.advanceTimersByTimeAsync(1200);
      expect(await pending).toContain("focusMode: not applied (TimeoutError)");
    } finally { vi.useRealTimers(); }
  });
});

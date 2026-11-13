import { describe, expect, it, vi } from "vitest";
import { acquireCamera, rankCameras } from "@/lib/scanner-camera";

const stream = () =>
  ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream;
describe("scanner camera ownership and fallback", () => {
  it("prefers 1080p and preserves the selected lens at every resolution fallback", async () => {
    const value = stream();
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(new DOMException("unsupported", "OverconstrainedError"))
      .mockResolvedValue(value);
    await acquireCamera({ getUserMedia, enumerateDevices: vi.fn() }, new AbortController().signal, "rear-main");
    expect(getUserMedia.mock.calls[0][0].video).toMatchObject({ deviceId: { exact: "rear-main" }, width: { ideal: 1920 }, height: { ideal: 1080 } });
    expect(getUserMedia.mock.calls[1][0].video).toMatchObject({ deviceId: { exact: "rear-main" }, width: { ideal: 1280 }, height: { ideal: 720 } });
  });
  it("releases the camera even if lens enumeration stalls", async () => {
    vi.useFakeTimers();
    try {
      const stop=vi.fn();const controller=new AbortController();
      const value={getTracks:()=>[{stop}]} as unknown as MediaStream;
      const pending=acquireCamera({getUserMedia:vi.fn().mockResolvedValue(value),enumerateDevices:vi.fn(()=>new Promise<MediaDeviceInfo[]>(()=>{}))},controller.signal);
      const rejection=expect(pending).rejects.toHaveProperty('name','AbortError');
      await vi.advanceTimersByTimeAsync(0);controller.abort();
      expect(stop).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(501);await rejection;
    } finally { vi.useRealTimers(); }
  });
  it("relaxes unsupported camera constraints", async () => {
    const value = stream();
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(
        new DOMException("unsupported", "OverconstrainedError"),
      )
      .mockResolvedValue(value);
    expect(
      await acquireCamera(
        { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([]) },
        new AbortController().signal,
      ),
    ).toBe(value);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1][0].video).toEqual({
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    });
  });
  it("does not repeat denied permission requests", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    await expect(
      acquireCamera(
        { getUserMedia, enumerateDevices: vi.fn() },
        new AbortController().signal,
      ),
    ).rejects.toHaveProperty("name", "NotAllowedError");
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
  it("stops streams arriving after cancellation", async () => {
    let resolve!: (value: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((done) => {
          resolve = done;
        }),
    );
    const stop = vi.fn();
    const controller = new AbortController();
    const pending = acquireCamera(
      { getUserMedia, enumerateDevices: vi.fn() },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toHaveProperty("name", "AbortError");
    resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
  });
  it("times out without leaking late streams", async () => {
    vi.useFakeTimers();
    try {
      let resolve!: (value: MediaStream) => void;
      const getUserMedia = vi.fn(
        () =>
          new Promise<MediaStream>((done) => {
            resolve = done;
          }),
      );
      const pending = acquireCamera(
        { getUserMedia, enumerateDevices: vi.fn() },
        new AbortController().signal,
        undefined,
        20,
      );
      const rejected = expect(pending).rejects.toHaveProperty(
        "name",
        "TimeoutError",
      );
      await vi.advanceTimersByTimeAsync(21);
      await rejected;
      const stop = vi.fn();
      resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
      await Promise.resolve();
      expect(stop).toHaveBeenCalledOnce();
      expect(getUserMedia).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
  it("prefers the rear main lens over ultra-wide, macro, or selfie", () => {
    const cameras = ["front", "back ultra wide", "back main", "back macro"].map(
      (label) => ({ kind: "videoinput", label }),
    ) as MediaDeviceInfo[];
    expect(rankCameras(cameras)[0].label).toBe("back main");
  });
});

import { expect, it } from "vitest";
import { fallbackCamera } from "@/lib/scanner-camera";

const devices = ["Camera 0", "front selfie", "rear ultra wide", "Camera 2", "rear main"].map((label, index) => ({ label, deviceId: String(index), kind: "videoinput" }) as MediaDeviceInfo);
const state = { enabled: true, busy: false, decoderActive: true, quietMs: 16000, switches: 0 };
it("tries an unvisited main/rear lens, then an opaque browser camera, without cycling", () => {
  expect(fallbackCamera(devices, new Set(["0"]), state)?.deviceId).toBe("4");
  expect(fallbackCamera(devices, new Set(["0", "4"]), { ...state, switches: 1 })?.deviceId).toBe("3");
  expect(fallbackCamera(devices, new Set(["0", "4", "3"]), { ...state, switches: 2 })).toBeUndefined();
});
it("does not switch during lookup, decoder stalls, cooldown, opt-out or on a single logical camera", () => {
  for (const changes of [{ busy: true }, { decoderActive: false }, { quietMs: 14999 }, { enabled: false }, { switches: 2 }]) {
    expect(fallbackCamera(devices, new Set(["0"]), { ...state, ...changes })).toBeUndefined();
  }
  expect(fallbackCamera(devices.slice(0, 1), new Set(["0"]), state)).toBeUndefined();
});

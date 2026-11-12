import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  native: vi.fn(),
  available: vi.fn(),
  write: vi.fn(),
  share: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: mocks.native,
    isPluginAvailable: mocks.available,
  },
}));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: { writeFile: mocks.write },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: mocks.share } }));
import { shareNativePdf } from "@/lib/native-pdf";
describe("native PDF delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.native.mockReturnValue(true);
    mocks.available.mockReturnValue(true);
    mocks.write.mockResolvedValue({ uri: "file:///private-cache/labels.pdf" });
    mocks.share.mockResolvedValue({});
  });
  it("uses private cache and shares the original binary PDF", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45]);
    expect(await shareNativePdf(bytes, 4)).toBe(true);
    expect(mocks.write).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: "CACHE",
        data: "JVBERi0=",
        path: expect.stringMatching(
          /^reyo-labels\/Reyo-Pack-4-per-A4-.+\.pdf$/,
        ),
      }),
    );
    expect(mocks.share).toHaveBeenCalledWith(
      expect.objectContaining({ files: ["file:///private-cache/labels.pdf"] }),
    );
  });
  it("keeps the browser download path and rejects an outdated native wrapper clearly", async () => {
    mocks.native.mockReturnValue(false);
    expect(await shareNativePdf(new Uint8Array(), 4)).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
    mocks.native.mockReturnValue(true);
    mocks.available.mockReturnValue(false);
    await expect(shareNativePdf(new Uint8Array(), 4)).rejects.toThrow(
      "updated Reyo Pack APK",
    );
  });
});

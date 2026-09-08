import { describe, expect, it } from "vitest";
import { hasValidImageSignature } from "@/lib/file-signatures";

describe("secure image signatures", () => {
  it("accepts supported image headers", () => {
    expect(hasValidImageSignature("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(hasValidImageSignature("image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(hasValidImageSignature("image/webp", Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe(true);
  });

  it("rejects a spoofed MIME type", () => {
    expect(hasValidImageSignature("image/png", new TextEncoder().encode("<script>bad"))).toBe(false);
  });
});

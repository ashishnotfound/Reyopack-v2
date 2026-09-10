import { describe, expect, it } from "vitest";
import { amazonMainImageFromPayload } from "@/lib/marketplaces/amazon-catalog-payload";

describe("Amazon catalog images", () => {
  it("selects the MAIN image from the requested marketplace", () => {
    expect(amazonMainImageFromPayload({
      images: [{
        marketplaceId: "A21TJRUUN4KGV",
        images: [
          { variant: "PT01", link: "https://m.media-amazon.com/images/I/alternate.jpg" },
          { variant: "MAIN", link: "https://m.media-amazon.com/images/I/main.jpg" },
        ],
      }],
    }, "A21TJRUUN4KGV")).toBe("https://m.media-amazon.com/images/I/main.jpg");
  });

  it("rejects non-Amazon and insecure image URLs", () => {
    expect(amazonMainImageFromPayload({ images: [{ images: [{ variant: "MAIN", link: "https://example.com/image.jpg" }] }] })).toBeNull();
    expect(amazonMainImageFromPayload({ images: [{ images: [{ variant: "MAIN", link: "http://m.media-amazon.com/image.jpg" }] }] })).toBeNull();
  });
});

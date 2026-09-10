import { describe, expect, it } from "vitest";
import { amazonMainImageFromPayload, amazonSearchMainImageFromPayload } from "@/lib/marketplaces/amazon-catalog-payload";

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

  it("uses a closely matching catalog-search result when an ASIN is unavailable", () => {
    expect(amazonSearchMainImageFromPayload({
      items: [
        {
          asin: "B000000001",
          summaries: [{ marketplaceId: "A21TJRUUN4KGV", itemName: "Unrelated generic wall poster for bedroom" }],
          images: [{ marketplaceId: "A21TJRUUN4KGV", images: [{ variant: "MAIN", link: "https://m.media-amazon.com/images/I/wrong.jpg" }] }],
        },
        {
          asin: "B000000002",
          summaries: [{ marketplaceId: "A21TJRUUN4KGV", itemName: "Aonami Anime Jujutsu Kaisen Poster A4 Pack of 6 Posters" }],
          images: [{ marketplaceId: "A21TJRUUN4KGV", images: [{ variant: "MAIN", link: "https://m.media-amazon.com/images/I/match.jpg" }] }],
        },
      ],
    }, "Aonami Anime Jujutsu Kaisen Poster For Room A4 Size Pack Of 6 Posters", "A21TJRUUN4KGV"))
      .toBe("https://m.media-amazon.com/images/I/match.jpg");
  });

  it("does not guess from a weak title match", () => {
    expect(amazonSearchMainImageFromPayload({
      items: [{
        summaries: [{ itemName: "Generic poster for a bedroom" }],
        images: [{ images: [{ variant: "MAIN", link: "https://m.media-amazon.com/images/I/wrong.jpg" }] }],
      }],
    }, "Premium stainless steel water bottle blue 1 litre")).toBeNull();
  });
});

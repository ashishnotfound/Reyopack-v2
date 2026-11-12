import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  arrangeLabels,
  classifyLabel,
  labelPlacement,
  markDuplicateLabels,
  type LabelRegion,
} from "@/lib/label-pdf";

describe("reference label layout and conservative extraction", () => {
  it("distinguishes separate invoices from labels containing invoice tables", () => {
    expect(
      classifyLabel(
        "Amazon Ship To AWB 123456789012 Tax Invoice Order 123-1234567-1234567",
      ).kind,
    ).toBe("label");
    expect(classifyLabel("Tax Invoice Invoice number 9 Bill To").kind).toBe(
      "invoice",
    );
    expect(classifyLabel("").kind).toBe("review");
    expect(classifyLabel("").selected).toBe(false);
  });
  it("never deduplicates by customer or Order ID alone", () => {
    const base: LabelRegion = {
      page: 0,
      x: 0,
      y: 0,
      width: 595,
      height: 842,
      kind: "label",
      orderId: "123-1234567-1234567",
      awb: "123456789012",
      selected: true,
    };
    const result = markDuplicateLabels([
      base,
      { ...base, awb: "123456789013" },
      { ...base },
    ]);
    expect(result.map((r) => r.selected)).toEqual([true, true, false]);
    expect(result[2].duplicateOf).toBe(0);
  });
  it("matches measured reference quadrant positions at exact half scale", () => {
    expect([0, 1, 2, 3].map((i) => labelPlacement(i, 4, 595, 842))).toEqual([
      { x: 0, y: 421, scale: 0.5, angle: 0 },
      { x: 297.5, y: 421, scale: 0.5, angle: 0 },
      { x: 0, y: 0, scale: 0.5, angle: 0 },
      { x: 297.5, y: 0, scale: 0.5, angle: 0 },
    ]);
    expect(labelPlacement(0, 1, 595, 842)).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      angle: 0,
    });
  });
  it("preserves every selected label, handles incomplete last sheets, and is deterministic", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    const regions: LabelRegion[] = [];
    for (let i = 0; i < 5; i++) {
      const page = source.addPage([595, 842]);
      page.drawText(`SYNTHETIC LABEL ${i}`, { font, x: 36, y: 780 });
      // Vector bars, rather than a flattened image.
      for (let bar = 0; bar < 90; bar += 2)
        page.drawRectangle({ x: 36 + bar * 2, y: 600, width: 2, height: 80 });
      regions.push({
        page: i,
        x: 0,
        y: 0,
        width: 595,
        height: 842,
        kind: "label",
        selected: true,
      });
    }
    const bytes = await source.save();
    const result = await arrangeLabels(bytes, regions, 4);
    const output = await PDFDocument.load(result);
    expect(output.getPageCount()).toBe(2);
    expect(output.getPages().map((p) => p.getSize())).toEqual([
      { width: 595, height: 842 },
      { width: 595, height: 842 },
    ]);
    expect(await arrangeLabels(bytes, regions, 4)).toEqual(result);
    expect(
      (
        await PDFDocument.load(await arrangeLabels(bytes, regions, 1))
      ).getPageCount(),
    ).toBe(5);
    await expect(arrangeLabels(bytes, [], 4)).rejects.toThrow(
      "Select at least",
    );
  });
});

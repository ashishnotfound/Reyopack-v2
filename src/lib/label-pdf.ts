import { PDFDocument, degrees } from "pdf-lib";

// Measured from the supplied finished reference. PDF coordinates start at bottom-left.
export const LABEL_SHEET = {
  width: 595,
  height: 842,
  columns: 2,
  rows: 2,
} as const;
export type LabelRegion = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "label" | "invoice" | "review";
  orderId?: string;
  awb?: string;
  selected: boolean;
  reason?: string;
  duplicateOf?: number;
};

export function classifyLabel(
  text: string,
): Pick<LabelRegion, "kind" | "orderId" | "awb" | "selected" | "reason"> {
  const orderId = text.match(/\b\d{3}-\d{7}-\d{7}\b/)?.[0];
  const awbText = text.toUpperCase().replace(/AWB (NUMBER|NO\.?)/g, "AWB");
  const awb = awbText.match(/\bAWB[\s:#-]{0,12}([A-Z0-9-]{10,20})\b/)?.[1];
  // A shipping label can contain its own invoice table; AWB/ship-to takes precedence.
  if (awb && /ship\s*to|delivery\s*station|amazon|atspl/i.test(text))
    return { kind: "label", orderId, awb, selected: true };
  if (
    /tax\s*invoice|invoice\s*(?:number|no\.?|details)|bill\s*to/i.test(text) &&
    !awb &&
    !/ship\s*to/i.test(text)
  ) {
    return {
      kind: "invoice",
      orderId,
      selected: false,
      reason: "Separate invoice page",
    };
  }
  return {
    kind: "review",
    orderId,
    awb,
    selected: false,
    reason:
      "Uncertain or image-only page. Preview and select it explicitly; it has not been discarded.",
  };
}

export function markDuplicateLabels(regions: LabelRegion[]) {
  const seen = new Map<string, number>();
  return regions.map((region, index) => {
    // Order ID alone cannot distinguish legitimate split shipments.
    const key =
      region.kind === "label" && region.awb && region.orderId
        ? `${region.orderId}:${region.awb}`
        : null;
    const previous = key ? seen.get(key) : undefined;
    if (previous !== undefined)
      return {
        ...region,
        selected: false,
        duplicateOf: previous,
        reason:
          "Same order ID and AWB. Review before excluding split-package labels.",
      };
    if (key) seen.set(key, index);
    return region;
  });
}

export function labelPlacement(
  index: number,
  mode: 1 | 4,
  width: number,
  height: number,
  rotation = 0,
) {
  const columns = mode === 4 ? 2 : 1;
  const cellWidth = LABEL_SHEET.width / columns;
  const cellHeight = LABEL_SHEET.height / columns;
  const rotated = Math.abs(rotation % 180) === 90;
  const visualWidth = rotated ? height : width;
  const visualHeight = rotated ? width : height;
  const scale = Math.min(cellWidth / visualWidth, cellHeight / visualHeight);
  const slot = index % mode;
  const left =
    (slot % columns) * cellWidth + (cellWidth - visualWidth * scale) / 2;
  const bottom =
    LABEL_SHEET.height -
    (Math.floor(slot / columns) + 1) * cellHeight +
    (cellHeight - visualHeight * scale) / 2;
  const angle = ((rotation % 360) + 360) % 360;
  return {
    x: left + (angle === 90 || angle === 180 ? visualWidth * scale : 0),
    y: bottom + (angle === 180 || angle === 270 ? visualHeight * scale : 0),
    scale,
    angle,
  };
}

export async function arrangeLabels(
  bytes: Uint8Array,
  regions: LabelRegion[],
  mode: 1 | 4,
) {
  const selected = regions.filter((region) => region.selected);
  if (!selected.length) throw new Error("Select at least one shipping label.");
  const source = await PDFDocument.load(bytes);
  const output = await PDFDocument.create();
  const pages = source.getPages();
  for (let index = 0; index < selected.length; index++) {
    const region = selected.at(index)!;
    const page = pages.at(region.page);
    if (!page || region.width <= 0 || region.height <= 0)
      throw new Error("Invalid label region.");
    const embedded = await output.embedPage(page, {
      left: region.x,
      bottom: region.y,
      right: region.x + region.width,
      top: region.y + region.height,
    });
    const sheet =
      index % mode === 0
        ? output.addPage([LABEL_SHEET.width, LABEL_SHEET.height])
        : output.getPages().at(-1)!;
    // Source page rotation is applied explicitly; embedding keeps vector text/barcode paths.
    const placement = labelPlacement(
      index,
      mode,
      region.width,
      region.height,
      -page.getRotation().angle,
    );
    sheet.drawPage(embedded, {
      x: placement.x,
      y: placement.y,
      xScale: placement.scale,
      yScale: placement.scale,
      rotate: degrees(placement.angle),
    });
    if (index % 20 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  output.setTitle("Reyo Pack shipping labels");
  output.setProducer("Reyo Pack");
  output.setCreationDate(new Date(0));
  output.setModificationDate(new Date(0));
  return output.save();
}

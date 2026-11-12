import {
  classifyLabel,
  markDuplicateLabels,
  type LabelRegion,
} from "@/lib/label-pdf";
import { isLikelyAwb, normalizeAwbLookup } from "@/lib/awb";

export async function openLabelPdf(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const loading = pdfjs.getDocument({
    data: bytes.slice(),
    enableXfa: false,
    stopAtErrors: true,
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loading.promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          void loading.destroy();
          reject(new Error("PDF loading timed out. Retry the file."));
        }, 30000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function inspectLabels(
  pdf: Awaited<ReturnType<typeof openLabelPdf>>,
  split: 1 | 4,
  progress?: (page: number) => void,
) {
  const regions: LabelRegion[] = [];
  for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex + 1);
    const [left, bottom, right, top] = page.view;
    const cols = split === 4 ? 2 : 1;
    const width = (right - left) / cols,
      height = (top - bottom) / cols;
    const text = await page.getTextContent();
    for (let slot = 0; slot < split; slot++) {
      const x = left + (slot % cols) * width;
      const y = top - (Math.floor(slot / cols) + 1) * height;
      const content = text.items
        .filter(
          (item) =>
            "str" in item &&
            item.transform[4] >= x &&
            item.transform[4] < x + width &&
            item.transform[5] >= y &&
            item.transform[5] <= y + height,
        )
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      const region: LabelRegion = {
        page: pageIndex,
        x,
        y,
        width,
        height,
        ...classifyLabel(content),
      };
      if (region.kind === "review" && !content.trim()) {
        // Image-only Amazon labels have no text layer. Rasterize only for analysis;
        // the final document still embeds the untouched PDF region.
        const {
          MultiFormatReader,
          RGBLuminanceSource,
          HybridBinarizer,
          BinaryBitmap,
          BarcodeFormat,
          DecodeHintType,
        } = await import("@zxing/library");
        const hints = new Map<import("@zxing/library").DecodeHintType, unknown>(
          [
            [
              DecodeHintType.POSSIBLE_FORMATS,
              [
                BarcodeFormat.CODE_128,
                BarcodeFormat.CODE_39,
                BarcodeFormat.CODE_93,
                BarcodeFormat.ITF,
                BarcodeFormat.CODABAR,
              ],
            ],
            [DecodeHintType.TRY_HARDER, true],
          ],
        );
        const reader = new MultiFormatReader();
        reader.setHints(hints);
        const viewport = page.getViewport({ scale: 1.5 });
        const bounds = [
          ...viewport.convertToViewportPoint(x, y),
          ...viewport.convertToViewportPoint(x + width, y + height),
        ] as number[];
        const left = Math.min(bounds[0], bounds[2]),
          top = Math.min(bounds[1], bounds[3]);
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(Math.abs(bounds[2] - bounds[0]));
        canvas.height = Math.ceil(Math.abs(bounds[3] - bounds[1]));
        await page.render({
          canvas,
          viewport,
          transform: [1, 0, 0, 1, -left, -top],
        }).promise;
        for (const fraction of [0.2, 0.25, 0.3, 0.5, 1]) {
          const crop = document.createElement("canvas");
          crop.width = canvas.width;
          crop.height = Math.ceil(canvas.height * fraction);
          crop.getContext("2d")!.drawImage(canvas, 0, 0);
          try {
            const rgba = crop
              .getContext("2d")!
              .getImageData(0, 0, crop.width, crop.height).data;
            const gray = new Uint8ClampedArray(crop.width * crop.height);
            for (let pixel = 0; pixel < gray.length; pixel++)
              // eslint-disable-next-line security/detect-object-injection -- Bounded numeric offset into a locally allocated typed pixel buffer.
              gray[pixel] =
                (rgba[pixel * 4] +
                  2 * rgba[pixel * 4 + 1] +
                  rgba[pixel * 4 + 2]) >>>
                2;
            const bitmap = new BinaryBitmap(
              new HybridBinarizer(
                new RGBLuminanceSource(gray, crop.width, crop.height),
              ),
            );
            const awb = normalizeAwbLookup(
              reader.decodeWithState(bitmap).getText(),
            );
            if (isLikelyAwb(awb)) {
              Object.assign(region, {
                kind: "label",
                awb,
                selected: true,
                reason:
                  "AWB decoded from image; verify order association before dispatch.",
              });
              break;
            }
          } catch {
            /* A frame without a readable barcode is a review item, not a discarded page. */
          } finally {
            crop.width = 0;
            crop.height = 0;
          }
        }
        canvas.width = 0;
        canvas.height = 0;
      }
      regions.push(region);
    }
    page.cleanup();
    progress?.(pageIndex + 1);
    // Yield between pages, including on mobile. Only one page is parsed/rendered at once.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return markDuplicateLabels(regions);
}

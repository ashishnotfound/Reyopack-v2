import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, ChecksumException, DecodeHintType, FormatException, NotFoundException, type Result } from "@zxing/library";

export type FrameReport = {
  width: number; height: number; durationMs: number;
  outcome: "decoded" | "not-found" | "checksum" | "format" | "error";
  format?: string;
};

/** Keeps ZXing's retry/stream ownership but measures the actual canvas passed to decoding. */
export class CameraBarcodeReader extends BrowserMultiFormatReader {
  constructor(private video: HTMLVideoElement, private report: (frame: FrameReport) => void) {
    super(new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.EAN_13]]]), {
      // Retry delay is after synchronous decoding, never an overlapping interval.
      // Valid AWBs are handled synchronously; this gap only matters when a
      // decoded non-AWB is rejected and scanning must continue.
      delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 100,
    });
  }

  override decodeFromCanvas(canvas: HTMLCanvasElement): Result {
    const started = performance.now();
    let outcome: FrameReport["outcome"] = "error";
    let format: string | undefined;
    try {
      // ZXing creates its canvas once. Reconcile intrinsic frame size after
      // rotation/resolution changes instead of clipping into an old 640x480 canvas.
      const { videoWidth: width, videoHeight: height } = this.video;
      if (width && height && (canvas.width !== width || canvas.height !== height)) {
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Camera capture canvas unavailable");
        context.drawImage(this.video, 0, 0); // 1:1 pixels, not CSS/preview dimensions.
      }
      const result = super.decodeFromCanvas(canvas);
      outcome = "decoded";
      format = BarcodeFormat[result.getBarcodeFormat()];
      return result;
    } catch (error) {
      outcome = error instanceof NotFoundException ? "not-found" : error instanceof ChecksumException ? "checksum" : error instanceof FormatException ? "format" : "error";
      throw error;
    } finally {
      this.report({ width: canvas.width, height: canvas.height, durationMs: Math.round(performance.now() - started), outcome, format });
    }
  }
}

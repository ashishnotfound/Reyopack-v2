import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, ChecksumException, DecodeHintType, FormatException, NotFoundException, type Result } from "@zxing/library";
import { frameSignal } from "@/lib/scanner-signal";

export type FrameReport = {
  width: number; height: number; durationMs: number;
  outcome: "decoded" | "not-found" | "checksum" | "format" | "error";
  format?: string;
  edgeScore?: number; brightness?: number;
};

/** Keeps ZXing's retry/stream ownership but measures the actual canvas passed to decoding. */
export class CameraBarcodeReader extends BrowserMultiFormatReader {
  private lastSignalAt = 0;
  private signal: ReturnType<typeof frameSignal> = null;
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
      if (performance.now() - this.lastSignalAt > 1000 && canvas.width && canvas.height) {
        this.lastSignalAt = performance.now();
        try {
          const w = Math.min(192, canvas.width), h = Math.min(96, canvas.height);
          const pixels = canvas.getContext("2d", { willReadFrequently: true })?.getImageData(Math.floor((canvas.width - w) / 2), Math.floor((canvas.height - h) / 2), w, h);
          this.signal = pixels ? frameSignal(pixels.data, w, h) : null;
        } catch { this.signal = null; }
      }
      const result = super.decodeFromCanvas(canvas);
      outcome = "decoded";
      format = BarcodeFormat[result.getBarcodeFormat()];
      return result;
    } catch (error) {
      outcome = error instanceof NotFoundException ? "not-found" : error instanceof ChecksumException ? "checksum" : error instanceof FormatException ? "format" : "error";
      throw error;
    } finally {
      this.report({ width: canvas.width, height: canvas.height, durationMs: Math.round(performance.now() - started), outcome, format, ...this.signal });
    }
  }
}

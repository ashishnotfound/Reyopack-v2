import type { CameraSnapshot } from "@/lib/scanner-quality";
import type { FrameReport } from "@/lib/scanner-reader";

export type ScannerDiagnostics = {
  camera: CameraSnapshot; adjustments: string[];
  frame?: FrameReport; attempts: number; decoded: number; rejected: number;
  notFound: number; checksum: number; formatErrors: number; errors: number;
  accepted: number; suppressed: number; decoderRunning: boolean;
  lastAttemptAt: number | null; lastDetectionAt: number | null; lastSuccessAt: number | null; lastDecodedAt: number | null;
  videoTime: number; videoAdvancedAt: number; recoveryAttempts: number; recoveryReason?: string; focusRecoveries: number;
  blocked: string; phase: string; lenses: string[]; sampledAt?: number;
};

export function ScannerDiagnosticPanel({ data }: { data: ScannerDiagnostics | null }) {
  if (!data) return null;
  const { camera: c, frame: f } = data;
  const low = c.width > 0 && c.height > 0 && c.width * c.height < 1280 * 720;
  const attemptAge = data.lastAttemptAt ? Math.max(0, (data.sampledAt ?? data.lastAttemptAt) - data.lastAttemptAt) : null;
  return <div className="space-y-2 px-5 pb-3 text-xs text-muted-foreground">
    {low ? <p role="status" className="font-semibold text-destructive">Camera granted only {c.width}×{c.height}. Try another rear lens, more light, or close and reopen the scanner.</p> : null}
    <details>
      <summary className="cursor-pointer py-2">Scanner diagnostics</summary>
      <div className="space-y-1 break-words" aria-label="Scanner diagnostic readings">
        <p>Scanner revision: consecutive-v2</p>
        <p>Camera: {c.camera} · Facing: {c.facing}</p>
        <p>Available cameras: {data.lenses.join("; ") || "not reported (browser may expose one logical rear camera)"}</p>
        <p>Track: {c.trackState} · Muted: {String(c.muted)} · Enabled: {String(c.enabled)} · Video time: {data.videoTime.toFixed(2)} s</p>
        <p>Scanner: {data.phase} · Decoder loop: {data.decoderRunning ? attemptAge !== null && attemptAge > 5000 ? "stalled" : "running" : "stopped"}</p>
        <p>Scan blocked: {data.blocked} · Last attempt age: {attemptAge === null ? "none" : `${attemptAge} ms`}</p>
        <p>Last accepted detection: {data.lastDetectionAt ? new Date(data.lastDetectionAt).toLocaleTimeString() : "none"} · Last successful lookup: {data.lastSuccessAt ? new Date(data.lastSuccessAt).toLocaleTimeString() : "none"}</p>
        <p>Accepted: {data.accepted} · Duplicate/busy suppression: {data.suppressed} · Recoveries: {data.recoveryAttempts} · Focus retries: {data.focusRecoveries}</p>
        {data.recoveryReason ? <p>Last recovery: {data.recoveryReason}</p> : null}
        <p>Requested: 1920×1080 preferred → 1280×720 → device default</p>
        <p>Actual stream: {c.width || "?"}×{c.height || "?"} · FPS: {c.fps === null ? "unreported" : Math.round(c.fps)}</p>
        <p>Decoder canvas: {f ? `${f.width}×${f.height}` : "waiting for frame"} · full intrinsic frame, no preview downscale</p>
        <p>Focus: {c.focus} · Distance: {c.focusDistance ?? "unreported"} · Supported range: {c.focusRange}</p>
        <p>Focus modes: {c.focusModes}</p>
        <p>Exposure: {c.exposure} · Time: {c.exposureTime ?? "unreported"} · Modes: {c.exposureModes}</p>
        <p>Zoom: {c.zoom ?? "unreported"} · Relative edge detail: {f?.edgeScore ?? "unreported"} · Brightness: {f?.brightness ?? "unreported"}/255</p>
        <p>Edge detail is scene-dependent, not a calibrated focus measurement. Compare the same barcode at different distances/lenses.</p>
        <p>Attempts: {data.attempts} · Decoded: {data.decoded} · Rejected non-AWB: {data.rejected}</p>
        <p>Not found: {data.notFound} · Checksum: {data.checksum} · Format: {data.formatErrors} · Unexpected errors: {data.errors}</p>
        <p>Last decode: {f?.outcome ?? "pending"}{f?.format ? ` (${f.format})` : ""} · Processing: {f?.durationMs ?? 0} ms · Retry gap: 100 ms</p>
        {data.adjustments.map((note, i) => <p key={i}>{note}</p>)}
        <p>No images, AWB values, or device IDs are logged or uploaded.</p>
      </div>
    </details>
  </div>;
}

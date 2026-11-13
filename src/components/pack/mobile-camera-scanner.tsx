"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isLikelyAwb, normalizeAwbLookup } from "@/lib/awb";
import { playScanBeep, primeAudioFeedback } from "@/lib/audio-feedback";
import { vibrateScanDetected } from "@/lib/native-feedback";
import { acquireCamera, cameraErrorMessage, rankCameras } from "@/lib/scanner-camera";
import { applyCameraConstraint, cameraCapabilities, cameraSnapshot, refocusCamera, tuneCamera } from "@/lib/scanner-quality";
import { playCameraPreview } from "@/lib/scanner-preview";
import { ScanGate } from "@/lib/scanner-gate";
import { ScannerDiagnosticPanel, type ScannerDiagnostics } from "@/components/pack/scanner-diagnostics";
import type { CameraBarcodeReader } from "@/lib/scanner-reader";
import type { IScannerControls } from "@zxing/browser";

type Phase = "idle" | "starting" | "active" | "paused" | "error";
type LookupResult = { ok: boolean; message: string };

export function MobileCameraScanner({ disabled, onAwb, soundEnabled, autoOpenRequest = 0, continuousScan = false, onContinuousChange }: {
  disabled: boolean; onAwb: (value: string) => Promise<LookupResult> | void;
  soundEnabled: boolean; autoOpenRequest?: number;
  continuousScan?: boolean; onContinuousChange?: (enabled: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<typeof CameraBarcodeReader | null>(null);
  const sessionRef = useRef(0);
  const decoderEpoch = useRef(0);
  const acquisitionRef = useRef<AbortController | null>(null);
  const selectedLens = useRef("");
  const gateRef = useRef(new ScanGate());
  const singleFinished = useRef(false);
  const openRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const continuousRef = useRef(false);
  const onAwbRef = useRef(onAwb);
  const statsRef = useRef<ScannerDiagnostics | null>(null);
  const recoveries = useRef<number[]>([]);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<(device?: string, recovery?: boolean) => Promise<void>>(async () => {});
  const decoderRef = useRef<() => void>(() => {});
  const focusTried = useRef(false);
  const focusBusy = useRef(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [torch, setTorch] = useState(false);
  const [refocusing, setRefocusing] = useState(false);
  const [diagnostics, setDiagnostics] = useState<ScannerDiagnostics | null>(null);

  useEffect(() => { onAwbRef.current = onAwb; }, [onAwb]);
  useEffect(() => { continuousRef.current = continuousScan; }, [continuousScan]);
  const transition = useCallback((value: Phase) => { phaseRef.current = value; setPhase(value); }, []);
  const stopDecoder = useCallback(() => {
    decoderEpoch.current++;
    // scan() owns only decoding; it never stops the live track or changes torch.
    controlsRef.current?.stop(); controlsRef.current = null;
    if (statsRef.current) statsRef.current.decoderRunning = false;
  }, []);
  const stopCamera = useCallback(() => {
    sessionRef.current++;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    acquisitionRef.current?.abort(); acquisitionRef.current = null;
    stopDecoder();
    streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stopDecoder]);
  useEffect(() => stopCamera, [stopCamera]);

  const publish = useCallback(() => {
    const stats = statsRef.current;
    if (!stats) return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) stats.camera = cameraSnapshot(track);
    stats.blocked = gateRef.current.busy ? "lookup in flight" : singleFinished.current ? "single-shot complete" : gateRef.current.reason;
    stats.phase = phaseRef.current;
    setDiagnostics({ ...stats, sampledAt: Date.now() });
  }, []);

  const finishScan = useCallback((raw: string) => {
    const awb = normalizeAwbLookup(raw);
    const stats = statsRef.current;
    if (!isLikelyAwb(awb)) { if (stats) stats.rejected++; return; }
    const gate = gateRef.current;
    if (singleFinished.current || !gate.begin(awb)) { if (stats) stats.suppressed++; return; }
    if (stats) { stats.accepted++; stats.lastDetectionAt = Date.now(); }
    setNotice("Looking up order…");
    if (soundEnabled) playScanBeep();
    void vibrateScanDetected();
    if (!continuousRef.current) {
      singleFinished.current = true;
      openRef.current = false; stopCamera(); setOpen(false);
    }
    // Every completion path releases this exact gate, including rejected promises.
    void (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          Promise.resolve(onAwbRef.current(awb)),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Lookup timed out")), 20000); }),
        ]);
        // Lookup ownership survives decoder/camera recovery, unlike the camera
        // epoch. A deliberate new scanner opening gets a different gate.
        if (gateRef.current === gate && result?.ok !== false && statsRef.current) statsRef.current.lastSuccessAt = Date.now();
        if (gateRef.current === gate && openRef.current) setNotice(result?.message ?? "Order loaded. View order to pack.");
      } catch {
        if (gateRef.current === gate && openRef.current) setNotice("Lookup failed. Scan another label or tap Retry this label.");
      } finally {
        clearTimeout(timeout); gate.finish();
        if (gateRef.current === gate && openRef.current) publish();
      }
    })();
  }, [publish, soundEnabled, stopCamera]);

  const scheduleRecovery = useCallback((reason: string, camera = false) => {
    if (!openRef.current || document.visibilityState === "hidden" || retryTimer.current) return;
    const now = Date.now();
    recoveries.current = recoveries.current.filter(time => now - time < 60000);
    const stats = statsRef.current;
    if (recoveries.current.length >= 3) {
      stopDecoder(); transition("error"); setError("Automatic recovery paused after three attempts. Choose a lens or tap Retry camera."); publish(); return;
    }
    recoveries.current.push(now);
    if (stats) { stats.recoveryAttempts++; stats.recoveryReason = reason; }
    if (camera) { stopCamera(); transition("starting"); }
    else stopDecoder();
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      if (!openRef.current || document.visibilityState === "hidden") return;
      if (camera) void startRef.current(selectedLens.current, true);
      else decoderRef.current(); // A moving, healthy video never needs a new stream here.
    }, 300);
    publish();
  }, [publish, stopCamera, stopDecoder, transition]);

  const startDecoder = useCallback(() => {
    const video = videoRef.current, Reader = readerRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!video || !Reader || !track || track.readyState === "ended" || !openRef.current) return;
    stopDecoder();
    const session = sessionRef.current, epoch = decoderEpoch.current;
    const stats = statsRef.current;
    if (!stats) return;
    stats.decoderRunning = true; stats.lastAttemptAt = Date.now(); stats.videoAdvancedAt = Date.now(); stats.videoTime = video.currentTime;
    const reader = new Reader(video, frame => {
      if (session !== sessionRef.current || epoch !== decoderEpoch.current) return;
      stats.frame = frame; stats.attempts++; stats.lastAttemptAt = Date.now();
      if (frame.outcome === "decoded") { stats.decoded++; stats.lastDecodedAt = Date.now(); }
      else if (frame.outcome === "not-found") stats.notFound++;
      else if (frame.outcome === "checksum") stats.checksum++;
      else if (frame.outcome === "format") stats.formatErrors++;
      else stats.errors++;
    });
    const controls = reader.scan(video, (result, decodeError) => {
      if (session !== sessionRef.current || epoch !== decoderEpoch.current) return;
      if (result) finishScan(result.getText());
      if (decodeError && stats.frame?.outcome === "error") scheduleRecovery("Decoder exception; restarting decoder only");
    });
    if (session !== sessionRef.current || epoch !== decoderEpoch.current) { controls.stop(); return; }
    controlsRef.current = controls;
    transition("active"); publish();
  }, [finishScan, publish, scheduleRecovery, stopDecoder, transition]);
  useEffect(() => { decoderRef.current = startDecoder; }, [startDecoder]);

  const startCamera = useCallback(async (deviceId?: string, recovery = false) => {
    stopCamera();
    if (!openRef.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      transition("error"); setError("Open the HTTPS app address to use live AWB scanning."); return;
    }
    if (soundEnabled) primeAudioFeedback();
    const session = sessionRef.current;
    const controller = new AbortController(); acquisitionRef.current = controller;
    transition("starting"); setError(""); setTorch(false); setRefocusing(false); focusBusy.current = false; focusTried.current = false;
    if (!recovery) { statsRef.current = null; setDiagnostics(null); }
    const timeout = setTimeout(() => { if (session === sessionRef.current) { stopCamera(); transition("error"); setError("Camera startup timed out. Choose another rear lens or retry."); } }, 20000);
    try {
      const { CameraBarcodeReader: Reader } = await import("@/lib/scanner-reader"); readerRef.current = Reader;
      const video = videoRef.current;
      if (!video || session !== sessionRef.current) return;
      const stream = await acquireCamera(navigator.mediaDevices, controller.signal, deviceId || selectedLens.current || undefined);
      if (session !== sessionRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      selectedLens.current = track.getSettings().deviceId ?? deviceId ?? "";
      setCameraId(selectedLens.current);
      await playCameraPreview(video, stream, controller.signal);
      // Configure focus on a PLAYING camera, not before the sensor starts supplying frames.
      const adjustments = await tuneCamera(track);
      if (session !== sessionRef.current) return;
      statsRef.current = recovery && statsRef.current ? { ...statsRef.current, camera: cameraSnapshot(track), adjustments } : {
        camera: cameraSnapshot(track), adjustments, attempts: 0, decoded: 0, rejected: 0, notFound: 0, checksum: 0, formatErrors: 0, errors: 0,
        accepted: 0, suppressed: 0, decoderRunning: false, lastAttemptAt: null, lastDetectionAt: null, lastSuccessAt: null, lastDecodedAt: Date.now(),
        videoTime: video.currentTime, videoAdvancedAt: Date.now(), recoveryAttempts: 0, focusRecoveries: 0, blocked: "none", phase: "starting", lenses: [],
      };
      track.addEventListener("ended", () => { if (session === sessionRef.current) scheduleRecovery("Camera track ended", true); }, { once: true });
      void navigator.mediaDevices.enumerateDevices().then(devices => {
        if (session !== sessionRef.current) return;
        const ranked = rankCameras(devices); setCameras(ranked);
        if (statsRef.current) statsRef.current.lenses = ranked.map((camera, index) => camera.label || `Camera ${index + 1} (lens identity unreported)`);
        publish();
      }).catch(() => undefined);
      startDecoder();
    } catch (caught) {
      if (session !== sessionRef.current) return;
      stopCamera(); transition("error"); setError(cameraErrorMessage(caught)); publish();
    } finally { clearTimeout(timeout); }
  }, [publish, scheduleRecovery, soundEnabled, startDecoder, stopCamera, transition]);
  useEffect(() => { startRef.current = startCamera; }, [startCamera]);

  const refocus = useCallback(async (automatic = false) => {
    const track = streamRef.current?.getVideoTracks()[0], controller = acquisitionRef.current;
    if (!track || !controller || focusBusy.current) return;
    const session = sessionRef.current;
    focusBusy.current = true; setRefocusing(true);
    if (statsRef.current) statsRef.current.focusRecoveries++;
    try { await refocusCamera(track, controller.signal); }
    catch { if (session === sessionRef.current) setError("Focus control unavailable or rejected. Move farther back, improve light, or choose another exposed rear lens."); }
    finally {
      if (session === sessionRef.current) { focusBusy.current = false; setRefocusing(false); if (automatic && statsRef.current) statsRef.current.adjustments = [...statsRef.current.adjustments, "One automatic focus retry after repeated misses (not proof of sharpness)"].slice(-8); publish(); }
    }
  }, [publish]);

  useEffect(() => {
    if (!open) return;
    const pause = () => {
      if (document.visibilityState === "hidden") { stopCamera(); transition("paused"); setError("Camera paused in background; it will resume when you return."); publish(); }
      else if (openRef.current && phaseRef.current === "paused") void startRef.current(selectedLens.current, true);
    };
    document.addEventListener("visibilitychange", pause);
    const timer = setInterval(() => {
      const stats = statsRef.current, video = videoRef.current;
      if (!stats || !video || document.visibilityState === "hidden") return;
      if (video.currentTime !== stats.videoTime) { stats.videoTime = video.currentTime; stats.videoAdvancedAt = Date.now(); }
      if (phaseRef.current === "active") {
        const now = Date.now();
        if (stats.lastAttemptAt && now - stats.lastAttemptAt > 5000) scheduleRecovery("Decoder attempts stalled; preserving camera stream");
        else if (now - stats.videoAdvancedAt > 7000) scheduleRecovery("Video frame clock stalled", true);
        else if (!focusTried.current && !gateRef.current.busy && now - (stats.lastDecodedAt ?? now) > 8000) {
          focusTried.current = true;
          const track = streamRef.current?.getVideoTracks()[0];
          const modes = track ? cameraCapabilities(track).focusMode : [];
          if (modes?.some(mode => mode === "single-shot" || mode === "continuous")) void refocus(true);
          else setError("Decoder is trying but no barcode is recognized. Improve light/distance or choose another available rear camera.");
        }
      }
      publish();
    }, 1000);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", pause); };
  }, [open, publish, refocus, scheduleRecovery, stopCamera, transition]);

  const changeOpen = useCallback((value: boolean) => {
    openRef.current = value;
    if (!value) stopCamera();
    else { gateRef.current = new ScanGate(); singleFinished.current = false; recoveries.current = []; setNotice(""); }
    transition("idle"); setError(""); setOpen(value);
  }, [stopCamera, transition]);
  useEffect(() => {
    if (autoOpenRequest > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      changeOpen(true);
    }
  }, [autoOpenRequest, changeOpen]);
  useEffect(() => { void import("@/lib/scanner-reader").catch(() => undefined); }, []);

  const caps = { torch: diagnostics?.camera.torchSupported, focusMode: diagnostics?.camera.focusModes.split(", "), zoom: diagnostics?.camera.zoomRange };
  return <>
    <Button type="button" variant="outline" className="h-12 w-full px-4" disabled={disabled} onClick={() => { if (soundEnabled) primeAudioFeedback(); changeOpen(true); }} aria-label="Scan AWB with camera"><Camera />Scan AWB</Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="flex max-h-[95dvh] flex-col overflow-y-auto p-0 sm:max-w-lg [&>*]:shrink-0" onOpenAutoFocus={event => { event.preventDefault(); void startCamera(); }}>
        <DialogHeader className="px-5 pt-5"><DialogTitle>Scan AWB barcode</DialogTitle><DialogDescription>Aim at the single long barcode above the printed AWB number. Avoid the square codes lower on the label. Continuous mode keeps the camera and decoder running.</DialogDescription></DialogHeader>
        <label className="flex items-center gap-2 px-5 text-sm"><input type="checkbox" aria-label="Keep scanner running" checked={continuousScan} onChange={event => { continuousRef.current = event.target.checked; onContinuousChange?.(event.target.checked); }} />Continuous scan — keep camera open for next label</label>
        <div className="relative mx-4 aspect-[4/3] overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 size-full object-contain" aria-label="Camera preview" />
          <div className="pointer-events-none absolute inset-x-[6%] top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/90" />
          {phase !== "active" ? <div className="absolute inset-0 grid place-items-center bg-black/65 p-6 text-center text-white"><div>{phase === "starting" ? <Loader2 className="mx-auto mb-3 animate-spin" /> : <CameraOff className="mx-auto mb-3" />}<p>{phase === "starting" ? "Starting camera…" : error || "Opening camera…"}</p></div></div> : null}
        </div>
        <p className="px-5 text-xs text-muted-foreground">Hold the full long barcode steady, about 15–30 cm away; move back if blurry. Resolution is not focus. Avoid glare; use Light on in dim rooms. Frames stay on this device.</p>
        {notice ? <div className="space-y-2 px-5" role="status" aria-label="Scan lookup result"><p className="text-sm font-semibold">{notice}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={disabled} onClick={() => { gateRef.current.retry(); setNotice("Ready to retry this label"); publish(); }}>Retry this label</Button><Button type="button" onClick={() => changeOpen(false)}>View order / Pack</Button></div></div> : null}
        {error && phase === "active" ? <p role="alert" className="px-5 text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2 px-5">
          {cameras.length > 1 ? <label className="text-sm">Camera<select aria-label="Camera lens" className="ml-2 max-w-56 rounded border bg-background p-2" value={cameraId} disabled={phase === "starting"} onChange={event => { selectedLens.current = event.target.value; void startCamera(event.target.value); }}>{cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}</select></label> : null}
          {caps.torch && phase === "active" ? <Button type="button" variant="outline" aria-pressed={torch} onClick={async () => { const track = streamRef.current?.getVideoTracks()[0], session = sessionRef.current; if (!track) return; try { await applyCameraConstraint(track, { advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); if (session === sessionRef.current) { setTorch(!torch); publish(); } } catch { if (session === sessionRef.current) setError("Light control was rejected by this camera."); } }}>{torch ? "Light off" : "Light on"}</Button> : null}
          {caps.focusMode?.some(mode => mode === "continuous" || mode === "single-shot") && phase === "active" ? <Button type="button" variant="outline" disabled={refocusing} onClick={() => void refocus()}>{refocusing ? "Refocusing…" : "Refocus"}</Button> : null}
          {phase === "active" ? <Button type="button" variant="outline" onClick={() => scheduleRecovery("Manual decoder restart")}>Restart decoder</Button> : null}
          {phase === "error" || phase === "paused" ? <Button type="button" onClick={() => { recoveries.current = []; void startCamera(selectedLens.current, true); }}>Retry camera</Button> : null}
          {caps.zoom && caps.zoom.max > caps.zoom.min && phase === "active" ? <label className="w-full text-sm">Camera zoom (reported: {diagnostics?.camera.zoom ?? "unreported"})<input className="mt-2 w-full" type="range" aria-label="Camera zoom" min={caps.zoom.min} max={caps.zoom.max} step={caps.zoom.step || 0.1} defaultValue={diagnostics?.camera.zoom ?? caps.zoom.min} onPointerUp={event => { const track = streamRef.current?.getVideoTracks()[0]; if (track) void applyCameraConstraint(track, { advanced: [{ zoom: Number(event.currentTarget.value) } as MediaTrackConstraintSet] }).then(publish).catch(() => setError("Zoom control was rejected; camera remains available.")); }} onKeyUp={event => { const track = streamRef.current?.getVideoTracks()[0]; if (track) void applyCameraConstraint(track, { advanced: [{ zoom: Number(event.currentTarget.value) } as MediaTrackConstraintSet] }).then(publish).catch(() => setError("Zoom control was rejected.")); }} /></label> : null}
        </div>
        <ScannerDiagnosticPanel data={diagnostics} />
      </DialogContent>
    </Dialog>
  </>;
}

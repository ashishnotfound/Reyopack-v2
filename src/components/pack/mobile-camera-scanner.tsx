"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isLikelyAwb, normalizeAwbLookup } from "@/lib/awb";
import { playErrorTone, playScanBeep, primeAudioFeedback } from "@/lib/audio-feedback";
import { vibrateError, vibrateScanDetected } from "@/lib/native-feedback";
import { acquireCamera, cameraErrorMessage, rankCameras } from "@/lib/scanner-camera";
import type { IScannerControls } from "@zxing/browser";

type ScannerState = "idle" | "starting" | "active" | "error";

export function MobileCameraScanner({
  disabled,
  onAwb,
  soundEnabled,
  autoOpenRequest = 0,
}: {
  disabled: boolean;
  onAwb: (value: string) => void;
  soundEnabled: boolean;
  autoOpenRequest?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const sessionRef = useRef(0);
  const acquisitionRef = useRef<AbortController | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resultHandledRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torch, setTorch] = useState(false);

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    acquisitionRef.current?.abort();
    acquisitionRef.current = null;
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream && typeof (stream as MediaStream).getTracks === "function") {
      (stream as MediaStream).getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const finishAwbScan = useCallback((rawValue: string) => {
    const awb = normalizeAwbLookup(rawValue);
    if (!isLikelyAwb(awb) || resultHandledRef.current) return false;
    resultHandledRef.current = true;
    if (soundEnabled) playScanBeep();
    void vibrateScanDetected();
    stopCamera();
    setOpen(false);
    onAwb(awb);
    return true;
  }, [onAwb, soundEnabled, stopCamera]);

  const startCamera = useCallback(async (deviceId?: string) => {
    if (soundEnabled) primeAudioFeedback();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setScannerState("error");
      setErrorMessage("Open the HTTPS app address to use live AWB scanning.");
      return;
    }

    stopCamera();
    resultHandledRef.current = false;
    const session = sessionRef.current;
    const acquisition = new AbortController();
    acquisitionRef.current = acquisition;
    setScannerState("starting");
    setErrorMessage("");
    setTorch(false); setTorchAvailable(false);
    const startupTimeout = setTimeout(() => {
      if (session !== sessionRef.current) return;
      stopCamera(); setScannerState("error");
      setErrorMessage("Camera preview did not start. Close other camera apps, choose another lens, and retry.");
    }, 20000);

    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      const video = videoRef.current;
      if (!video || session !== sessionRef.current) return;
      const stream = await acquireCamera(navigator.mediaDevices, acquisition.signal, deviceId);
      if (session !== sessionRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      // Optional controls must never turn a usable camera into a startup failure.
      let capabilities: (MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean }) | undefined;
      try { capabilities = track.getCapabilities?.(); } catch { /* Optional on older WebViews. */ }
      if (capabilities?.focusMode?.includes("continuous")) {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
      }
      if (session !== sessionRef.current) return;
      track.addEventListener("ended", () => {
        if (session !== sessionRef.current) return;
        stopCamera(); setScannerState("error"); setErrorMessage("Camera disconnected or permission changed. Retry camera to continue.");
      }, { once: true });
      setTorchAvailable(Boolean(capabilities?.torch));
      setCameraId(track.getSettings().deviceId ?? "");
      void navigator.mediaDevices.enumerateDevices().then((devices) => {
        if (session === sessionRef.current) setCameras(rankCameras(devices));
      }).catch(() => undefined);
      const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.EAN_13]]]), {
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: 0,
      });
      const controls = await reader.decodeFromStream(stream, video, (result) => {
        if (result && session === sessionRef.current) finishAwbScan(result.getText());
      });

      if (session !== sessionRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setScannerState("active");
    } catch (error) {
      if (session !== sessionRef.current) return;
      stopCamera();
      setScannerState("error");
      setErrorMessage(cameraErrorMessage(error));
      if (soundEnabled) playErrorTone();
      void vibrateError();
    } finally { clearTimeout(startupTimeout); }
  }, [finishAwbScan, soundEnabled, stopCamera]);

  useEffect(() => {
    const pause = () => {
      if (document.visibilityState === "hidden") {
        stopCamera();
        setScannerState("error");
        setErrorMessage("Camera paused while the app was in the background. Tap Retry camera to resume.");
      }
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [stopCamera]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) stopCamera();
    resultHandledRef.current = false;
    setScannerState("idle");
    setErrorMessage("");
    setOpen(nextOpen);
  }, [stopCamera]);

  useEffect(() => {
    if (autoOpenRequest > 0) {
      // An explicit successful-packing event requests the next camera session.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleOpenChange(true);
    }
  }, [autoOpenRequest, handleOpenChange]);

  useEffect(() => { void Promise.all([import("@zxing/browser"), import("@zxing/library")]).catch(() => undefined); }, []);

  const working = scannerState === "starting";

  return (
    <>
      <Button type="button" variant="outline" className="h-12 w-full px-4" disabled={disabled} onClick={() => { if (soundEnabled) primeAudioFeedback(); handleOpenChange(true); }} aria-label="Scan AWB with camera">
        <Camera />
        Scan AWB
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg" onOpenAutoFocus={(event) => { event.preventDefault(); void startCamera(); }}>
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>Scan AWB barcode</DialogTitle>
            <DialogDescription>Aim at the single long barcode above the printed AWB number. Avoid the square codes lower on the label.</DialogDescription>
          </DialogHeader>

          <div className="relative mx-4 aspect-[4/3] overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} autoPlay muted playsInline className="size-full object-cover" aria-label="Camera preview" />
            <div className="pointer-events-none absolute inset-x-[6%] top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/90 shadow-[0_0_0_999px_rgb(0_0_0/0.28)]">
              <span className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-primary shadow-[0_0_14px_var(--primary)]" />
            </div>
            {scannerState !== "active" ? (
              <div className="absolute inset-0 grid place-items-center bg-black/65 p-6 text-center text-white">
                <div className="flex max-w-sm flex-col items-center">
                  {working ? <Loader2 className="mb-3 size-9 animate-spin" /> : errorMessage ? <CameraOff className="mb-3 size-9" /> : <ScanLine className="mb-3 size-9" />}
                  <p className="font-semibold">{working ? "Starting camera…" : errorMessage || "Ready for the AWB barcode"}</p>
                  {!working && !errorMessage ? <p className="mt-2 text-xs text-white/70">Opening your rear camera automatically.</p> : null}
                </div>
              </div>
            ) : null}
          </div>

          <p className="px-5 text-xs text-muted-foreground">The barcode is decoded on this device and the photo is not uploaded.</p>
          {scannerState === "active" && errorMessage ? <p role="alert" className="px-5 text-sm text-destructive">{errorMessage}</p> : null}
          <div className="flex flex-wrap gap-2 px-5 pb-3">
            {cameras.length > 1 ? <label className="text-sm">Camera<select aria-label="Camera lens" className="ml-2 max-w-56 rounded border bg-background p-2" value={cameraId} disabled={working} onChange={(event) => void startCamera(event.target.value)}>{cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}</select></label> : null}
            {torchAvailable && scannerState === "active" ? <Button variant="outline" aria-pressed={torch} onClick={async () => {
              try { await streamRef.current?.getVideoTracks()[0]?.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); }
              catch { setErrorMessage("This camera could not change the light. Try another lens."); }
            }}>{torch ? "Light off" : "Light on"}</Button> : null}
          </div>
          {errorMessage ? <DialogFooter className="mx-0 mb-0">
            <Button type="button" onClick={() => void startCamera()} disabled={working || scannerState === "active"}>
              {scannerState === "starting" ? <Loader2 className="animate-spin" /> : <Camera />}
              {scannerState === "active" ? "Camera active" : "Retry camera"}
            </Button>

          </DialogFooter> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

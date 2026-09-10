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
import { playScanBeep, primeAudioFeedback } from "@/lib/audio-feedback";
import type { IScannerControls } from "@zxing/browser";

type ScannerState = "idle" | "starting" | "active" | "error";

export function MobileCameraScanner({
  disabled,
  onAwb,
  soundEnabled,
}: {
  disabled: boolean;
  onAwb: (value: string) => void;
  soundEnabled: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const sessionRef = useRef(0);
  const resultHandledRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
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
    stopCamera();
    setOpen(false);
    onAwb(awb);
    return true;
  }, [onAwb, soundEnabled, stopCamera]);

  const startCamera = useCallback(async () => {
    if (soundEnabled) primeAudioFeedback();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setScannerState("error");
      setErrorMessage("Open the HTTPS app address to use live AWB scanning.");
      return;
    }

    stopCamera();
    resultHandledRef.current = false;
    const session = sessionRef.current;
    setScannerState("starting");
    setErrorMessage("");

    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      const video = videoRef.current;
      if (!video || session !== sessionRef.current) return;
      const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.EAN_13]]]), {
        delayBetweenScanAttempts: 35,
        delayBetweenScanSuccess: 0,
      });
      const controls = await reader.decodeFromConstraints({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      }, video, (result) => {
        if (result && session === sessionRef.current) finishAwbScan(result.getText());
      });

      if (session !== sessionRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setScannerState("active");
    } catch (error) {
      stopCamera();
      setScannerState("error");
      setErrorMessage(cameraErrorMessage(error));
    }
  }, [finishAwbScan, soundEnabled, stopCamera]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) stopCamera();
    resultHandledRef.current = false;
    setScannerState("idle");
    setErrorMessage("");
    setOpen(nextOpen);
  }, [stopCamera]);

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

function cameraErrorMessage(error: unknown) {
  if (!(error instanceof DOMException)) return "The camera could not be started. Check camera permissions and retry.";
  if (error.name === "NotAllowedError" || error.name === "SecurityError") return "Camera access was blocked. Allow camera permission for Reyo Pack and try again.";
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") return "No camera was found on this device.";
  if (error.name === "NotReadableError" || error.name === "TrackStartError") return "The camera is busy in another app. Close it there and try again.";
  return "The camera could not be started. Check camera permissions and retry.";
}

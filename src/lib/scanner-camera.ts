/** Camera acquisition is owned by one scanner session, including late permission replies. */
export async function acquireCamera(
  media: Pick<MediaDevices, "getUserMedia" | "enumerateDevices">,
  signal: AbortSignal,
  preferredDevice?: string,
  timeoutMs = 15000,
): Promise<MediaStream> {
  const lens: MediaTrackConstraints = preferredDevice
    ? { deviceId: { exact: preferredDevice } }
    : { facingMode: { ideal: "environment" } };
  // Ideals are preferences, not proof of the granted stream size. tuneCamera
  // checks getSettings afterwards. Never silently drop an explicitly selected lens.
  const videoOptions: (MediaTrackConstraints | boolean)[] = [
    { ...lens, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
    { ...lens, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    lens,
    ...(preferredDevice ? [] : [true]),
  ];
  let lastError: unknown;
  for (const video of videoOptions) {
    signal.throwIfAborted();
    try {
      const stream = await new Promise<MediaStream>((resolve, reject) => {
        let settled = false;
        const finish = (error?: unknown, value?: MediaStream) => {
          if (settled) {
            value?.getTracks().forEach((track) => track.stop());
            return;
          }
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          if (error) reject(error);
          else resolve(value!);
        };
        const abort = () =>
          finish(new DOMException("Camera session closed", "AbortError"));
        const timer = setTimeout(
          () =>
            finish(
              new DOMException(
                "Camera permission or startup timed out",
                "TimeoutError",
              ),
            ),
          timeoutMs,
        );
        signal.addEventListener("abort", abort, { once: true });
        media
          .getUserMedia({ audio: false, video })
          .then((value) => finish(undefined, value), finish);
      });
      if (signal.aborted) {
        stream.getTracks().forEach((track) => track.stop());
        signal.throwIfAborted();
      }
      if (!preferredDevice) {
        // Device labels become available after permission. Prefer the main rear lens on
        // multi-camera phones instead of accepting a macro/ultra-wide/front default.
        const stopWhileSelecting = () => stream.getTracks().forEach(track => track.stop());
        signal.addEventListener('abort', stopWhileSelecting, { once: true });
        let enumerationTimer: ReturnType<typeof setTimeout> | undefined;
        let devices: MediaDeviceInfo[];
        try {
          devices = await Promise.race([
            Promise.resolve(media.enumerateDevices()).catch(() => []),
            new Promise<MediaDeviceInfo[]>(resolve => { enumerationTimer=setTimeout(()=>resolve([]),500); }),
          ]);
        } finally {
          clearTimeout(enumerationTimer);signal.removeEventListener('abort',stopWhileSelecting);
        }
        if(signal.aborted){stream.getTracks().forEach(track=>track.stop());signal.throwIfAborted();}
        const best = rankCameras(devices)[0];
        const current = stream.getVideoTracks?.()[0]?.getSettings?.().deviceId;
        if (
          best?.deviceId &&
          current &&
          best.deviceId !== current &&
          shouldPreferCamera(stream.getVideoTracks?.()[0]?.label ?? "", best.label)
        ) {
          stream.getTracks().forEach((track) => track.stop());
          return acquireCamera(media, signal, best.deviceId, timeoutMs);
        }
      }
      if (signal.aborted) {
        stream.getTracks().forEach((track) => track.stop());
        signal.throwIfAborted();
      }
      return stream;
    } catch (error) {
      lastError = error;
      // Re-requesting permission, or opening another camera while permission is pending, is unsafe.
      if (
        signal.aborted ||
        [
          "NotAllowedError",
          "SecurityError",
          "TimeoutError",
          "AbortError",
        ].includes((error as Error)?.name)
      )
        throw error;
    }
  }
  throw lastError;
}

export function shouldPreferCamera(currentLabel: string, candidateLabel: string) {
  // An opaque label is not evidence of a better lens. Do not hop between generic
  // rear lenses just because enumeration order or a "wide" substring differs.
  if (!/back|rear|environment/i.test(candidateLabel) || /ultra|macro|depth|tele/i.test(candidateLabel)) return false;
  if (/front|selfie|ultra|macro|depth|tele/i.test(currentLabel)) return true;
  return /main/i.test(candidateLabel) && !/main/i.test(currentLabel);
}

export function rankCameras(devices: MediaDeviceInfo[]) {
  return devices
    .filter((device) => device.kind === "videoinput")
    .sort((a, b) => score(b.label) - score(a.label));
}

function score(label: string) {
  return (
    (/back|rear|environment/i.test(label) ? 10 : 0) +
    (/main|wide(?!.*ultra)|camera 0/i.test(label) ? 2 : 0) -
    (/front|selfie/i.test(label) ? 20 : 0) -
    (/ultra|macro|depth|tele/i.test(label) ? 5 : 0)
  );
}

export function cameraErrorMessage(error: unknown) {
  const name = (error as Error)?.name;
  if (["NotAllowedError", "SecurityError"].includes(name))
    return "Camera access was blocked. Allow camera permission for Reyo Pack in your browser or Android app settings, then retry.";
  if (["NotFoundError", "DevicesNotFoundError"].includes(name))
    return "No camera was found on this device.";
  if (["NotReadableError", "TrackStartError"].includes(name))
    return "The camera is busy. Close other camera apps, then retry or choose another rear camera.";
  if (name === "TimeoutError")
    return "Camera startup timed out. Check the permission prompt, close other camera apps, and retry.";
  return "The camera could not start. Retry or choose another camera.";
}

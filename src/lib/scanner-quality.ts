// The image-capture extensions are not present in every browser's DOM typings.
type CameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  exposureMode?: string[];
  focusDistance?: { min: number; max: number; step?: number };
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
};
type CameraSettings = MediaTrackSettings & {
  focusMode?: string;
  exposureMode?: string;
  focusDistance?: number;
  exposureTime?: number;
  torch?: boolean;
  zoom?: number;
};

export function cameraCapabilities(track: MediaStreamTrack): CameraCapabilities {
  try { return track.getCapabilities?.() ?? {}; } catch { return {}; }
}

export function cameraSnapshot(track: MediaStreamTrack) {
  let settings: CameraSettings = {};
  try { settings = track.getSettings?.() ?? {}; } catch { /* Older WebViews. */ }
  const caps = cameraCapabilities(track);
  // Deliberately omit stable device IDs, raw barcode contents and camera frames.
  return {
    camera: track.label || "Camera name unavailable",
    width: settings.width ?? 0, height: settings.height ?? 0,
    fps: settings.frameRate ?? null, facing: settings.facingMode ?? "unreported",
    focus: settings.focusMode ?? "unreported",
    focusDistance: settings.focusDistance ?? null,
    focusRange: caps.focusDistance ? `${caps.focusDistance.min}–${caps.focusDistance.max}` : "unreported",
    exposure: settings.exposureMode ?? "unreported",
    exposureTime: settings.exposureTime ?? null,
    torch: settings.torch ?? null,
    focusModes: caps.focusMode?.join(", ") || "unreported",
    exposureModes: caps.exposureMode?.join(", ") || "unreported",
    trackState: track.readyState ?? "unreported", muted: track.muted ?? false, enabled: track.enabled ?? true,
    zoom: settings.zoom ?? null, zoomRange: caps.zoom ?? null,
    torchSupported: Boolean(caps.torch),
  };
}
export type CameraSnapshot = ReturnType<typeof cameraSnapshot>;

export async function applyCameraConstraint(track: MediaStreamTrack, constraints: MediaTrackConstraints) {
  // applyConstraints replaces, rather than patches, the previous constraint set.
  // Focus/torch changes must not discard the resolution or selected-device request.
  let current: MediaTrackConstraints = {};
  try { current = track.getConstraints?.() ?? {}; } catch { /* Optional in older WebViews. */ }
  const next = { ...current, ...constraints };
  if (constraints.advanced) {
    const replaced = new Set(constraints.advanced.flatMap(entry => Object.keys(entry)));
    const retained = (current.advanced ?? [])
      .map(entry => Object.fromEntries(Object.entries(entry).filter(([key]) => !replaced.has(key))))
      .filter(entry => Object.keys(entry).length > 0);
    next.advanced = [...retained, ...constraints.advanced];
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      track.applyConstraints(next),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DOMException("Optional camera setting timed out", "TimeoutError")), 1000); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function tuneCamera(track: MediaStreamTrack) {
  const notes: string[] = [];
  const settings = cameraSnapshot(track);
  if (settings.width && settings.height && settings.width * settings.height < 1280 * 720) {
    for (const [width, height] of [[1920, 1080], [1280, 720]]) {
      try {
        // Upgrade the same live lens, without reopening permission or choosing a front camera.
        await applyCameraConstraint(track, { width: { min: 1280, ideal: width }, height: { min: 720, ideal: height } });
        const actual = cameraSnapshot(track);
        notes.push(`Resolution retry: granted ${actual.width}×${actual.height}`);
        if (actual.width * actual.height >= 1280 * 720) break;
      } catch (error) { notes.push(`Resolution retry: not applied (${(error as Error).name})`); }
    }
  }
  const caps = cameraCapabilities(track);
  for (const [key, modes] of [["focusMode", caps.focusMode], ["exposureMode", caps.exposureMode]] as const) {
    const mode = modes?.includes("continuous") ? "continuous" : modes?.includes("single-shot") ? "single-shot" : null;
    if (!mode) continue;
    try {
      await applyCameraConstraint(track, { advanced: [{ [key]: mode } as MediaTrackConstraintSet] });
      notes.push(`${key}: ${mode} requested (see actual settings)`);
    } catch (error) { notes.push(`${key}: not applied (${(error as Error).name})`); }
  }
  return notes;
}

export async function refocusCamera(track: MediaStreamTrack, signal: AbortSignal) {
  const modes = cameraCapabilities(track).focusMode ?? [];
  signal.throwIfAborted();
  const mode = modes.includes("single-shot") ? "single-shot" : modes.includes("continuous") ? "continuous" : null;
  if (!mode) throw new Error("Automatic focus control unavailable");
  await applyCameraConstraint(track, { advanced: [{ focusMode: mode } as MediaTrackConstraintSet] });
  if (mode === "single-shot" && modes.includes("continuous")) {
    // Give the requested focus sweep time to run before restoring continuous AF.
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException("Camera session closed", "AbortError")); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 600);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    signal.throwIfAborted();
    await applyCameraConstraint(track, { advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
  }
}

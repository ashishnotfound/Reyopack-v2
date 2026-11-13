/** Start the video before configuring autofocus; all waits belong to this camera session. */
export async function playCameraPreview(video: HTMLVideoElement, stream: MediaStream, signal: AbortSignal) {
  signal.throwIfAborted();
  video.srcObject = stream;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    await Promise.race([
      video.play(),
      new Promise<never>((_, reject) => {
        abort = () => reject(new DOMException("Camera session closed", "AbortError"));
        signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => reject(new DOMException("Preview did not play", "TimeoutError")), 10000);
      }),
    ]);
    signal.throwIfAborted();
    if (!video.videoWidth || !video.videoHeight) throw new DOMException("Preview has no video frames", "NotReadableError");
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener("abort", abort);
  }
}

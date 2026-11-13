/* eslint-disable security/detect-object-injection -- Bounded integer pixel offsets into locally sampled typed arrays, never object keys from input. */
/** Relative scene/detail metric only: not a calibrated optical focus detector. */
export function frameSignal(rgba: Uint8ClampedArray, width: number, height: number) {
  if (width < 3 || height < 3 || rgba.length < width * height * 4) return null;
  const gray = new Uint8Array(width * height);
  let light = 0;
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = (rgba[p] + 2 * rgba[p + 1] + rgba[p + 2]) / 4;
    light += gray[i];
  }
  let edges = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    edges += Math.abs(gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i]);
  }
  return { edgeScore: Math.round(edges / ((width - 2) * (height - 2)) * 10) / 10, brightness: Math.round(light / gray.length) };
}

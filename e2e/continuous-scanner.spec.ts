import { expect, test, type Page } from "@playwright/test";
import { Code128Reader } from "@zxing/library";
import { DEMO_ORDER } from "../src/lib/demo-data";

const labels = Array.from({ length: 12 }, (_, i) => `9900000000${String(i + 1).padStart(2, "0")}`);
const table = (Code128Reader as unknown as { CODE_PATTERNS: number[][] }).CODE_PATTERNS;
const barcodes = labels.map(label => {
  const pairs = label.match(/../g)!.map(Number);
  const checksum = (105 + pairs.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
  return [105, ...pairs, checksum, 106].map(code => Array.from(table.at(code)!));
});
type CameraTest = { label: (index: number) => void; hidden: (value: boolean) => void; failDecode: () => void; stallDecoder: () => void; acquisitions: string[]; stops: number };

async function camera(page: Page) {
  await page.addInitScript(({ barcodes }) => {
    const canvas = document.createElement("canvas"); canvas.width = 1920; canvas.height = 1080;
    const ctx = canvas.getContext("2d")!;
    let index = -1, hidden = false, failures = 0, stall = false;
    const originalTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      // Drop one decoder retry while the independent camera/video clock keeps moving.
      if (stall && delay === 100 && typeof handler === "function") { stall = false; return originalTimeout(() => {}, 100); }
      return originalTimeout(handler, delay, ...args);
    }) as typeof window.setTimeout;
    const controls = { acquisitions: [] as string[], stops: 0,
      label: (value: number) => { index = value; paint(); },
      hidden: (value: boolean) => { hidden = value; document.dispatchEvent(new Event("visibilitychange")); },
      failDecode: () => { failures = 2; },
      stallDecoder: () => { stall = true; },
    };
    const originalPixels = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args: Parameters<typeof originalPixels>) {
      if (failures > 0) { failures--; throw new DOMException("Synthetic read failure", "InvalidStateError"); }
      return originalPixels.apply(this, args);
    };
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => hidden ? "hidden" : "visible" });
    const paint = () => {
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1920, 1080);
      if (index < 0) return;
      let x = 200; ctx.fillStyle = "black";
      for (const pattern of barcodes.at(index)!) for (let i = 0; i < pattern.length; i++) {
        const width = pattern.at(i)! * 5;
        if (i % 2 === 0) ctx.fillRect(x, 400, width, 280);
        x += width;
      }
    };
    Object.assign(window, { cameraTest: controls });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      enumerateDevices: async () => [
        { kind: "videoinput", deviceId: "main", label: "back main" },
        { kind: "videoinput", deviceId: "alternate", label: "back alternate" },
      ],
      getUserMedia: async (input: MediaStreamConstraints) => {
        const initial = input.video as MediaTrackConstraints;
        const id = typeof initial.deviceId === "object" && !Array.isArray(initial.deviceId) ? String(initial.deviceId.exact) : "main";
        controls.acquisitions.push(id); paint();
        const stream = canvas.captureStream(15), track = stream.getVideoTracks()[0];
        let constraints = initial;
        Object.defineProperty(track, "label", { value: `back ${id}` });
        track.getSettings = () => ({ width: canvas.width, height: canvas.height, frameRate: 15, facingMode: "environment", deviceId: id });
        track.getConstraints = () => constraints;
        track.getCapabilities = () => ({ focusMode: ["continuous", "single-shot"], exposureMode: ["continuous"], torch: true, zoom: { min: 1, max: 3, step: 0.1 } } as MediaTrackCapabilities);
        track.applyConstraints = async (value = {}) => { constraints = value; if (!value.width || !value.height) { canvas.width = 640; canvas.height = 480; } };
        const timer = setInterval(paint, 66), originalStop = track.stop.bind(track);
        track.stop = () => { controls.stops++; clearInterval(timer); originalStop(); };
        return stream;
      },
    } });
  }, { barcodes });
}
async function showLabel(page: Page, index: number) {
  await page.evaluate(value => (window as unknown as { cameraTest: CameraTest }).cameraTest.label(value), index);
}
async function attempts(page: Page) {
  const text = await page.getByLabel("Scanner diagnostic readings").innerText();
  return Number(text.match(/Attempts: (\d+)/)?.[1] ?? 0);
}

test("ten distinct decoded labels, held duplicates and lookup failure keep one camera and a live decoder", async ({ page }) => {
  const seen: string[] = [], errors: string[] = []; let packingWrites = 0;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/orders/*/pack", route => { packingWrites++; return route.abort(); });
  await page.route("**/api/shipping/handover", route => { packingWrites++; return route.abort(); });
  await page.route("**/api/orders/scan-lookup", async route => {
    const query = route.request().postDataJSON().query as string; seen.push(query);
    if (query === labels.at(10)) return route.fulfill({ status: 404, json: { error: "Synthetic order not found" } });
    return route.fulfill({ json: { order: { ...DEMO_ORDER, awb: query } } });
  });
  await camera(page); await page.goto("/pack");
  await page.getByLabel("Continuous label scanning", { exact: true }).check();
  await page.getByRole("button", { name: "Scan AWB with camera" }).click();
  await page.getByText("Scanner diagnostics", { exact: true }).click();
  for (let i = 0; i < 10; i++) {
    const before = await attempts(page);
    await showLabel(page, i);
    await expect.poll(() => seen.length).toBe(i + 1);
    await expect(page.getByLabel("Scan lookup result")).toContainText("Order loaded");
    await expect.poll(() => attempts(page)).toBeGreaterThan(before);
    await expect(page.getByRole("dialog")).toBeVisible();
  }
  expect(seen).toEqual(labels.slice(0, 10));
  const beforeRepeat = await attempts(page);
  await expect.poll(() => attempts(page)).toBeGreaterThan(beforeRepeat + 3);
  expect(seen).toHaveLength(10); // Same held code genuinely decodes again, but no duplicate lookup.
  await showLabel(page, 10);
  await expect(page.getByLabel("Scan lookup result")).toContainText("lookup failed");
  await showLabel(page, 11);
  await expect(page.getByLabel("Scan lookup result")).toContainText("Order loaded");
  await expect.poll(() => seen.length).toBe(12);
  expect(await page.evaluate(() => (window as unknown as { cameraTest: CameraTest }).cameraTest.acquisitions)).toEqual(["main"]);
  expect(await page.evaluate(() => (window as unknown as { cameraTest: CameraTest }).cameraTest.stops)).toBe(0);
  expect(packingWrites).toBe(0); expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("continuous-scanner.png") });
});

test("decoder-only recovery, refocus, zoom and background resume retain the selected lens", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  let seen = 0;
  await page.route("**/api/orders/scan-lookup", async route => {
    seen++;
    if (seen === 3) await new Promise(resolve => setTimeout(resolve, 1200));
    return route.fulfill({ json: { order: DEMO_ORDER } });
  });
  await camera(page); await page.goto("/pack");
  await page.getByLabel("Continuous label scanning", { exact: true }).check();
  await page.getByRole("button", { name: "Scan AWB with camera" }).click();
  await page.getByText("Scanner diagnostics", { exact: true }).click();
  const diagnostics = page.getByLabel("Scanner diagnostic readings");
  await expect(diagnostics).toContainText("Decoder loop: running");
  await page.getByRole("button", { name: "Refocus", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refocus", exact: true })).toBeEnabled();
  await page.getByLabel("Camera zoom").focus();
  await page.getByLabel("Camera zoom").press("ArrowRight");
  await expect(diagnostics).toContainText("Decoder canvas: 1920×1080");
  await showLabel(page, 0); await expect.poll(() => seen).toBe(1);
  await page.evaluate(() => (window as unknown as { cameraTest: CameraTest }).cameraTest.failDecode());
  await expect(diagnostics).toContainText("Recoveries: 1");
  await expect(diagnostics).toContainText("Decoder loop: running");
  await showLabel(page, 1); await expect.poll(() => seen).toBe(2);
  const videoTime = await page.getByLabel("Camera preview").evaluate((video: HTMLVideoElement) => video.currentTime);
  await page.evaluate(() => (window as unknown as { cameraTest: CameraTest }).cameraTest.stallDecoder());
  await expect(diagnostics).toContainText("Recoveries: 2", { timeout: 10000 });
  await expect(diagnostics).toContainText("Decoder loop: running");
  expect(await page.getByLabel("Camera preview").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(videoTime);
  expect(await page.evaluate(() => (window as unknown as { cameraTest: CameraTest }).cameraTest.acquisitions)).toEqual(["main"]);
  await page.getByLabel("Camera lens").selectOption("alternate");
  await expect(diagnostics).toContainText("Camera: back alternate");
  await showLabel(page, 2); await expect.poll(() => seen).toBe(3);
  await expect(page.getByLabel("Scan lookup result")).toContainText("Looking up");
  await page.evaluate(() => (window as unknown as { cameraTest: CameraTest }).cameraTest.hidden(true));
  await expect(page.getByText(/Camera paused in background/)).toBeVisible();
  await page.evaluate(() => (window as unknown as { cameraTest: CameraTest }).cameraTest.hidden(false));
  await expect(diagnostics).toContainText("Decoder loop: running");
  await expect(page.getByLabel("Scan lookup result")).toContainText("Order loaded");
  await showLabel(page, 3); await expect.poll(() => seen).toBe(4);
  expect(await page.evaluate(() => (window as unknown as { cameraTest: CameraTest }).cameraTest.acquisitions)).toEqual(["main", "alternate", "alternate"]);
  expect(errors).toEqual([]);
});

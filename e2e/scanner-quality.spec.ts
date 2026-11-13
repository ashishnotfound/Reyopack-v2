import { expect, test } from "@playwright/test";
import { DEMO_ORDER } from "../src/lib/demo-data";

// Synthetic Code 128: 990000000001. No customer labels or camera images.
const bars = ["211232", "113141", "212222", "212222", "212222", "212222", "222122", "121322", "2331112"];

for (const upgrade of [true, false]) {
  test(`scanner measures ${upgrade ? "upgraded 1080p and portrait" : "unsupported low-resolution fallback"} frames without CSS downscaling`, async ({ page }) => {
    let lookups = 0;
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("**/api/orders/scan-lookup", route => {
      expect(route.request().postDataJSON()).toEqual({ query: "990000000001", exact: true });
      lookups++;
      return route.fulfill({ json: { order: DEMO_ORDER } });
    });
    await page.addInitScript(({ upgrade, bars }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      let showBarcode = false;
      const paint = () => {
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (!showBarcode) return;
        let x = 80;
        ctx.fillStyle = "black";
        for (const pattern of bars) for (let j = 0; j < pattern.length; j++) {
          const width = Number(pattern.at(j)) * 3;
          if (j % 2 === 0) ctx.fillRect(x, canvas.height / 2 - 80, width, 160);
          x += width;
        }
      };
      Object.assign(window, {
        scannerTestScene: (scene: "portrait" | "barcode") => {
          if (scene === "portrait") { canvas.width = 1080; canvas.height = 1920; }
          else showBarcode = true;
          paint();
        },
      });
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
        enumerateDevices: async () => [],
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          // Verify what the app requests; actual initial grant deliberately differs.
          if ((constraints.video as MediaTrackConstraints).width && JSON.stringify((constraints.video as MediaTrackConstraints).width) !== JSON.stringify({ ideal: 1920 })) throw new Error("Expected 1080p preference");
          paint();
          const stream = canvas.captureStream(15);
          const track = stream.getVideoTracks()[0];
          let currentConstraints = constraints.video as MediaTrackConstraints;
          Object.defineProperty(track, "label", { value: "Synthetic rear main" });
          track.getSettings = () => ({ width: canvas.width, height: canvas.height, frameRate: 15, facingMode: "environment", deviceId: "synthetic" });
          track.getCapabilities = () => ({ focusMode: ["continuous"], exposureMode: ["continuous"], torch: true } as MediaTrackCapabilities);
          track.getConstraints = () => currentConstraints;
          track.applyConstraints = async (next = {}) => {
            if (!upgrade) throw new DOMException("Unsupported upgrade", "OverconstrainedError");
            currentConstraints = next;
            // Model the documented replacement semantics: losing width/height
            // on an autofocus/torch change drops this fake camera to its default.
            canvas.width = next.width ? 1920 : 640;
            canvas.height = next.height ? 1080 : 480;
            paint();
          };
          const timer = setInterval(paint, 66);
          const originalStop = track.stop.bind(track);
          track.stop = () => { clearInterval(timer); originalStop(); };
          return stream;
        },
      } });
    }, { upgrade, bars });
    await page.goto("/pack");
    await page.getByRole("button", { name: "Scan AWB with camera" }).click();
    await page.getByText("Scanner diagnostics", { exact: true }).click();
    const diagnostics = page.getByLabel("Scanner diagnostic readings");
    const dimensions = upgrade ? "1920×1080" : "640×480";
    await expect(diagnostics).toContainText(`Actual stream: ${dimensions}`);
    await expect(diagnostics).toContainText(`Decoder canvas: ${dimensions}`);
    await expect(diagnostics).toContainText("not-found");
    expect(await page.getByLabel("Camera preview").evaluate(video => video.getBoundingClientRect().width)).toBeLessThan(upgrade ? 1920 : 640);
    if (upgrade) {
      await page.getByRole("button", { name: "Light on", exact: true }).click();
      await expect(page.getByRole("button", { name: "Light off", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Refocus", exact: true }).click();
      await expect.poll(() => page.getByLabel("Camera preview").evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(1920);
      await expect(diagnostics).toContainText("Actual stream: 1920×1080");
      await expect(diagnostics).toContainText("Decoder canvas: 1920×1080");
      await page.screenshot({ path: test.info().outputPath("scanner-diagnostics.png") });
      await test.info().attach("camera-readings", { body: await diagnostics.innerText(), contentType: "text/plain" });
      await page.evaluate(() => (window as unknown as { scannerTestScene: (scene: string) => void }).scannerTestScene("portrait"));
      await expect(diagnostics).toContainText("Decoder canvas: 1080×1920");
    } else {
      await expect(page.getByText("Camera granted only 640×480.", { exact: false })).toBeVisible();
    }
    await page.evaluate(() => (window as unknown as { scannerTestScene: (scene: string) => void }).scannerTestScene("barcode"));
    await expect(page.getByRole("heading", { name: "Spider-Man Poster" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(lookups).toBe(1);
    expect(pageErrors).toEqual([]);
  });
}

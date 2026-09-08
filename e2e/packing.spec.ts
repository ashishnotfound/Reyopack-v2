import { expect, test } from "@playwright/test";

const orderId = "408-1234567-1234567";
let browserErrors: string[];

test.beforeEach(async ({ request, page }) => {
  browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await request.post("/api/demo/reset");
  await page.addInitScript(() => localStorage.setItem("reyo-pack-sound", "off"));
  await page.goto("/pack");
});

test.afterEach(async () => {
  expect(browserErrors).toEqual([]);
});

test("normal packing records the authenticated worker and reaches admin activity", async ({ page }, testInfo) => {
  const scanner = page.getByLabel("Scan AWB, barcode, or order ID");
  await expect(page.locator("body")).not.toHaveText("");
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  await expect(scanner).toBeFocused();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-pack-workstation.png`, fullPage: true });
  await scanner.fill(orderId);
  await scanner.press("Enter");
  await expect(page.getByRole("heading", { name: "Frieren A4 Art Print" })).toBeVisible();
  await expect(page.getByText("FRIEREN-A4-01", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Mark order packed" }).click();
  await expect(page.getByRole("heading", { name: "PACKED" })).toBeVisible();
  await expect(page.getByText("Packed by Reyo", { exact: true })).toBeVisible();
  await page.goto("/admin/activity");
  await expect(page.getByRole("link", { name: new RegExp(orderId) }).first()).toBeVisible();
});

test("the same unpacked order can be scanned twenty times without warnings or events", async ({ page }) => {
  const scanner = page.getByLabel("Scan AWB, barcode, or order ID");
  for (let index = 0; index < 20; index += 1) {
    await scanner.fill(orderId);
    await scanner.press("Enter");
    await expect(page.getByRole("heading", { name: "Frieren A4 Art Print" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Ready to scan" })).toBeVisible();
  }
  await expect(page.getByText(/too many|scan limit|suspicious|recently viewed/i)).toHaveCount(0);
});

test("packed orders remain inspectable and show permanent attribution", async ({ page }) => {
  const scanner = page.getByLabel("Scan AWB, barcode, or order ID");
  await scanner.fill(orderId);
  await scanner.press("Enter");
  await page.getByRole("button", { name: "Mark order packed" }).click();
  await expect(page.getByRole("heading", { name: "Ready to scan" })).toBeVisible({ timeout: 5_000 });
  await scanner.fill(orderId);
  await scanner.press("Enter");
  await expect(page.getByText("Packed by Reyo", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Order already packed" })).toBeDisabled();
});

test("a rapid double click still creates one packing event", async ({ page }) => {
  const scanner = page.getByLabel("Scan AWB, barcode, or order ID");
  await scanner.fill(orderId);
  await scanner.press("Enter");
  const packed = page.getByRole("button", { name: "Mark order packed" });
  await expect(packed).toBeEnabled();
  await packed.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole("heading", { name: "PACKED" })).toBeVisible();
  await page.goto("/admin/activity");
  await expect(page.getByRole("link", { name: new RegExp(orderId) })).toHaveCount(1);
});

test("concurrent packing requests produce one new event", async ({ page }) => {
  const results = await page.evaluate(async (id) => {
    const body = JSON.stringify({ deviceId: crypto.randomUUID(), userAgent: "Playwright concurrency test" });
    const request = () => fetch(`/api/orders/${id}/pack`, { method: "POST", headers: { "Content-Type": "application/json" }, body }).then((response) => response.json());
    return Promise.all([request(), request()]);
  }, "10000000-0000-4000-8000-000000000001") as Array<{ alreadyPacked: boolean }>;
  expect(results.filter((result) => result.alreadyPacked === false)).toHaveLength(1);
  expect(results.filter((result) => result.alreadyPacked === true)).toHaveLength(1);
});

test("a lost connection never reports a local packing success", async ({ page, context }) => {
  const scanner = page.getByLabel("Scan AWB, barcode, or order ID");
  await scanner.fill(orderId);
  await scanner.press("Enter");
  await expect(page.getByRole("heading", { name: "Frieren A4 Art Print" })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Mark order packed" }).click();
  await expect(page.getByText("CONNECTION LOST")).toBeVisible();
  await expect(page.getByRole("heading", { name: "PACKED" })).toHaveCount(0);
  await context.setOffline(false);
});

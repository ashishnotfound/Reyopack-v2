// Optional private verification: no customer fixture, text, or image is written to the repo.
import { chromium } from "@playwright/test";
const source = process.argv[2];
if (!source)
  throw new Error("Usage: node scripts/check-private-source.mjs original.pdf");
const browser = await chromium.launch();
let watchdog;
try {
  const page = await browser.newPage();
  watchdog = setInterval(async () => {
    const text = await page
      .getByRole("status")
      .textContent({ timeout: 1000 })
      .catch(() => null);
    if (text?.startsWith("Inspecting page")) console.log(text);
  }, 15000);
  // Test extraction only, independently of whether these old orders still exist in Supabase.
  await page.route("**/api/shipping/labels", async (route) => {
    const input = route.request().postDataJSON();
    const orders = (input.awbs ?? []).map((awb, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      marketplace_order_id: `123-1234567-${String(index).padStart(7, "0")}`,
      awb,
      state: "pending",
      handed_over: false,
    }));
    await route.fulfill({ json: { orders } });
  });
  await page.goto("http://localhost:3000/labels");
  await page.getByLabel("Upload Amazon PDF").setInputFiles(source);
  await page
    .getByRole("status")
    .filter({ hasText: /label regions/ })
    .waitFor({ timeout: 180000 });
  console.log(await page.getByRole("status").textContent());
  const reviewPages = [];
  do {
    reviewPages.push(
      ...(
        await page
          .locator('section[aria-label="Label extraction review"] strong')
          .allTextContents()
      ).filter((text) => text.endsWith("review")),
    );
    if (
      !(await page
        .getByRole("button", { name: "Next 50", exact: true })
        .isEnabled())
    )
      break;
    await page.getByRole("button", { name: "Next 50", exact: true }).click();
  } while (true);
  console.log("uncertain_regions", reviewPages);
  const generation = page.getByRole("button", {
    name: /^Generate \d+ labels$/,
  });
  console.log("ready_to_generate", await generation.isEnabled());
} finally {
  clearInterval(watchdog);
  await browser.close();
}

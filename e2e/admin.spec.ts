import { expect, test } from "@playwright/test";

let browserErrors: string[];

test.beforeEach(async ({ page }) => {
  browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
});

test.afterEach(() => {
  expect(browserErrors).toEqual([]);
});

test("every admin surface renders real operational content", async ({ page }) => {
  test.setTimeout(90_000);
  const routes: Array<[string, string]> = [
    ["/admin", "Operations dashboard"],
    ["/admin/activity", "Packing activity"],
    ["/admin/orders", "Orders"],
    ["/admin/orders/10000000-0000-4000-8000-000000000001", "Order 408-1234567-1234567"],
    ["/admin/orders/import", "Import orders"],
    ["/admin/products", "Products"],
    ["/admin/workers", "Workers"],
    ["/admin/locations", "Locations"],
    ["/admin/integrations", "Integrations"],
    ["/admin/sync", "Marketplace sync"],
    ["/admin/reports", "Reports"],
    ["/admin/retention", "Data retention"],
    ["/admin/system-health", "System health"],
    ["/admin/settings", "Settings"],
  ];

  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  }

  await page.goto("/admin/workers");
  await expect(page.getByRole("link", { name: "History" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Update role" }).first()).toBeDisabled();
  await page.goto("/admin/orders/import");
  await expect(page.getByRole("link", { name: "Download template" })).toHaveAttribute("download", "reyo-pack-orders-template.csv");
  await page.goto("/admin/integrations");
  await expect(page.getByRole("heading", { name: "Amazon SP-API credentials" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save & verify" })).toBeDisabled();
});

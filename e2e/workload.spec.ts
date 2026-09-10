import { expect, test } from "@playwright/test";

test("an open workload updates when another worker packs", async ({ page, request }) => {
  await request.post("/api/demo/reset");
  await page.goto("/workload");
  await expect(page.getByRole("button", { name: "Unpacked Today 1", exact: true })).toBeVisible();
  const response = await request.post("/api/orders/10000000-0000-4000-8000-000000000001/pack", {
    data: { deviceId: "second-worker", userAgent: "workload test" },
  });
  expect(response.ok()).toBeTruthy();
  await expect(page.getByRole("button", { name: "Unpacked Today 0", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "Going Today 1", exact: true })).toBeVisible();
});

test("workload opens orders for repeat checking and updates after packing", async ({ page, request }) => {
  await request.post("/api/demo/reset");
  await page.goto("/workload");
  await expect(page.getByRole("heading", { name: "Order status" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unpacked Today 1", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Checking / Open order" }).click();
  await expect(page.getByRole("heading", { name: "Frieren A4 Art Print" })).toBeVisible();
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unpacked Today 1", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Checking / Open order" }).click();
  await page.getByRole("button", { name: "Mark order packed" }).click();
  await expect(page.getByRole("heading", { name: "PACKED", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unpacked Today 0", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Going Today 1", exact: true })).toBeVisible();
  await expect(page.getByText(/Packed by Reyo/)).toBeVisible();
  await page.getByRole("button", { name: "Tomorrow / Upcoming", exact: true }).click();
  await expect(page.getByText("No orders in this filter.")).toBeVisible();
  await page.getByRole("button", { name: "Sync Orders", exact: true }).click();
  await expect(page.getByText(/Fetched 0 · Added 0 · Updated 0 · Unchanged 0 · Failed 0/)).toBeVisible();
});

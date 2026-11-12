import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { DEMO_ORDER } from "../src/lib/demo-data";

test("select-all spans pages, batch survives reload, and printing respects a subset", async ({
  page,
}) => {
  const batchId = "90000000-0000-4000-8000-000000000001";
  const orders = Array.from({ length: 55 }, (_, i) => ({
    ...DEMO_ORDER,
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    marketplaceOrderId: `123-1234567-${String(i).padStart(7, "0")}`,
    shipByDate: "2026-11-12",
    awb: i === 0 ? "990000000001" : `990000000001-${i}`,
  }));
  let excluded: string[] = [];
  await page.route("**/api/shipping/queue?**", (route) => {
    const url = new URL(route.request().url());
    const number = Number(url.searchParams.get("page") ?? 1);
    const selected = url.searchParams.has("batch")
      ? orders.filter((o) => !excluded.includes(o.id))
      : orders;
    return route.fulfill({
      json: {
        date: "2026-11-12",
        page: number,
        pageSize: 50,
        total: selected.length,
        counts: {
          today: selected.length,
          scanned: 0,
          unscanned: selected.length,
          remaining: selected.length,
          packed: 0,
        },
        orders: selected.slice((number - 1) * 50, number * 50),
      },
    });
  });
  await page.route("**/api/shipping/batch", (route) => {
    const input = route.request().postDataJSON();
    expect(input.all).toBe(true);
    expect(input.ids).toEqual([]);
    expect(input.exclude).toEqual([orders[54].id]);
    excluded = input.exclude;
    return route.fulfill({ json: { id: batchId, total: 54 } });
  });
  await page.route("**/api/shipping/labels", (route) =>
    route.fulfill({
      json: {
        orders: orders
          .slice(0, 4)
          .map((o) => ({
            id: o.id,
            marketplace_order_id: o.marketplaceOrderId,
            awb: o.awb,
            state: "pending",
            handed_over: false,
          })),
      },
    }),
  );
  await page.goto("/ship-today");
  await page
    .getByRole("button", { name: "Select All Eligible", exact: true })
    .click();
  await expect(
    page.getByLabel(`Select ${orders[0].marketplaceOrderId}`),
  ).toBeChecked();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByLabel(`Select ${orders[54].marketplaceOrderId}`),
  ).toBeChecked();
  await page.getByLabel(`Select ${orders[54].marketplaceOrderId}`).uncheck();
  await page
    .getByRole("button", { name: "Start Batch Packing", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`batch=${batchId}`));
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Shareable batch link" }),
  ).toBeVisible();
  await page.getByLabel(`Select ${orders[0].marketplaceOrderId}`).check();
  await page
    .getByRole("button", { name: "Print Selected Labels", exact: true })
    .click();
  await expect(page).toHaveURL(/\/labels$/);
  await page
    .getByLabel("Upload Amazon PDF")
    .setInputFiles({
      name: "synthetic-subset.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await sourceFixture()),
    });
  await expect(page.getByRole("status")).toContainText("invoices excluded");
  await page.getByLabel("Include region 8").uncheck();
  await page.getByLabel("Confirm uncertain page review").check();
  await expect(
    page.getByRole("button", { name: "Generate 1 labels", exact: true }),
  ).toBeEnabled();
});
// Synthetic ISO Code 128 C: start, 99 00 00 00 00 01, checksum 4, stop.
const bars = [
  [2, 1, 1, 2, 3, 2],
  [1, 1, 3, 1, 4, 1],
  [2, 1, 2, 2, 2, 2],
  [2, 1, 2, 2, 2, 2],
  [2, 1, 2, 2, 2, 2],
  [2, 1, 2, 2, 2, 2],
  [2, 2, 2, 1, 2, 2],
  [1, 2, 1, 3, 2, 2],
  [2, 3, 3, 1, 1, 1, 2],
];
async function sourceFixture() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 5; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(
      `Amazon Ship To SYNTHETIC TEST ONLY\nOrder ID: 123-1234567-${String(i === 4 ? 0 : i).padStart(7, "0")}\nAWB 990000000001`,
      { font, size: 16, x: 36, y: 790, lineHeight: 24 },
    );
    let x = 36;
    for (const pattern of bars) {
      for (let j = 0; j < pattern.length; j++) {
        const w = pattern.at(j)! * 2;
        if (j % 2 === 0)
          page.drawRectangle({ x, y: 570, width: w, height: 90 });
        x += w;
      }
    }
  }
  doc
    .addPage([595, 842])
    .drawText("Tax Invoice Invoice number 123 Bill To SYNTHETIC", {
      font,
      x: 36,
      y: 760,
      size: 14,
    });
  doc
    .addPage([595, 842])
    .drawRectangle({ x: 36, y: 500, width: 200, height: 200 });
  const imageOnly = doc.addPage([595, 842]);
  let bx = 36;
  for (const pattern of bars)
    for (let j = 0; j < pattern.length; j++) {
      const w = pattern.at(j)! * 2;
      if (j % 2 === 0)
        imageOnly.drawRectangle({ x: bx, y: 650, width: w, height: 90 });
      bx += w;
    }
  return doc.save();
}
test("PDF extraction, conservative review, duplicate handling and both A4 layouts", async ({
  page,
}) => {
  await page.route("**/api/shipping/labels", (route) =>
    route.fulfill({
      json: {
        orders: Array.from({ length: 4 }, (_, i) => ({
          id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
          marketplace_order_id: `123-1234567-${String(i).padStart(7, "0")}`,
          awb: "990000000001",
          state: "pending",
          handed_over: false,
        })),
      },
    }),
  );
  await page.goto("/labels");
  await page.getByLabel("Upload Amazon PDF").setInputFiles({
    name: "synthetic-source.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await sourceFixture()),
  });
  await expect(page.getByRole("status")).toContainText("5 label regions", {
    timeout: 30000,
  });
  await expect(page.getByRole("status")).toContainText("1 invoices excluded");
  await expect(
    page.getByRole("button", { name: "Generate 4 labels", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Confirm uncertain page review").check();
  await expect(
    page.getByRole("button", { name: "Generate 4 labels", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Include region 5")).not.toBeChecked();
  await expect(page.getByLabel("Include region 6")).not.toBeChecked();
  await expect(page.getByLabel("Include region 7")).not.toBeChecked();
  await expect(page.getByLabel("Include region 8")).not.toBeChecked();
  await expect(
    page.getByText(
      "AWB matches multiple orders. Confirm the exact order association before selecting.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate 4 labels", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download print-ready PDF" }).click();
  const result = await download;
  const stream = await result.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const output = await PDFDocument.load(Buffer.concat(chunks));
  expect(output.getPageCount()).toBe(1);
  expect(output.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
  await page.getByLabel("Output layout").selectOption("1");
  await page
    .getByRole("button", { name: "Generate 4 labels", exact: true })
    .click();
  const next = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download print-ready PDF" }).click();
  const one = await (await next).createReadStream();
  const data: Buffer[] = [];
  for await (const chunk of one) data.push(chunk);
  expect((await PDFDocument.load(Buffer.concat(data))).getPageCount()).toBe(4);
  await page.getByLabel("Source layout").selectOption("4");
  await page.getByLabel("Upload Amazon PDF").setInputFiles({
    name: "synthetic-four-up.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.concat(chunks),
  });
  await expect(page.getByRole("status")).toContainText("4 label regions");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("camera decodes Code 128 once per opening and permits a deliberate repeated scan", async ({
  page,
}) => {
  let lookups = 0;
  await page.route("**/api/orders/scan-lookup", (route) => {
    expect(route.request().postDataJSON()).toEqual({query:'990000000001',exact:true});
    lookups++;
    return route.fulfill({ json: { order: DEMO_ORDER } });
  });
  await page.addInitScript((patterns) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d")!;
    const paint = () => {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 1280, 720);
      let x = 180;
      ctx.fillStyle = "black";
      for (const pattern of patterns)
        for (let j = 0; j < pattern.length; j++) {
          const w = pattern.at(j)! * 5;
          if (j % 2 === 0) ctx.fillRect(x, 220, w, 240);
          x += w;
        }
    };
    const media = {
      getUserMedia: async () => {
        paint();
        const timer = setInterval(paint, 100);
        const stream = canvas.captureStream(10);
        stream
          .getVideoTracks()[0]
          .addEventListener("ended", () => clearInterval(timer));
        return stream;
      },
      enumerateDevices: async () => [],
    };
    Object.defineProperty(navigator, "mediaDevices", {
      value: media,
      configurable: true,
    });
  }, bars);
  await page.goto("/pack");
  await page.getByRole("button", { name: "Scan AWB with camera" }).click();
  await expect(
    page.getByRole("heading", { name: "Spider-Man Poster" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(lookups).toBe(1);
  await page.getByRole("button", { name: "Scan AWB with camera" }).click();
  await expect.poll(() => lookups).toBe(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Automatically open camera after packing").check();
  await page
    .getByRole("button", { name: "Mark order packed", exact: true })
    .click();
  await expect.poll(() => lookups).toBe(3);
});
test("Ship Today filters, selection and real batch action responses", async ({
  page,
}) => {
  await page.goto("/ship-today");
  await expect(
    page.getByRole("heading", { name: "Ship Today", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Shipping orders").getByText(DEMO_ORDER.marketplaceOrderId),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select All Eligible", exact: true })
    .click();
  await expect(
    page.getByText(/All eligible today across every page/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start Batch Packing", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "requires the connected database",
  );
  await page
    .getByRole("button", { name: "Review Exceptions", exact: true })
    .click();
  await expect(page.getByText("No orders in this filter.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Capacitor } from "@capacitor/core";
import { PdfSheetPreview } from "@/components/pack/pdf-sheet-preview";
import { shareNativePdf } from "@/lib/native-pdf";
import { arrangeLabels, type LabelRegion } from "@/lib/label-pdf";
import { inspectLabels, openLabelPdf } from "@/lib/label-inspection";

export function LabelPrinter() {
  const [regions, setRegions] = useState<LabelRegion[]>([]);
  const [mode, setMode] = useState<1 | 4>(4);
  const [split, setSplit] = useState<1 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(0);
  const [outputUrl, setOutputUrl] = useState("");
  const [outputBytes, setOutputBytes] = useState<Uint8Array | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const bytesRef = useRef<Uint8Array | null>(null);
  const pdfRef = useRef<Awaited<ReturnType<typeof openLabelPdf>> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const generation = useRef(0);
  const [selectionNotice, setSelectionNotice] = useState("");
  const renderRef = useRef<{ cancel(): void } | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      renderRef.current?.cancel();
      void pdfRef.current?.loadingTask.destroy();
    },
    [],
  );
  useEffect(
    () => () => {
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    },
    [outputUrl],
  );
  useEffect(() => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    const region = regions.at(preview);
    if (!pdf || !canvas || !region) return;
    let cancelled = false;
    void (async () => {
      const page = await pdf.getPage(region.page + 1);
      if (cancelled) return;
      const viewport = page.getViewport({
        scale: Math.min(1.5, 800 / page.getViewport({ scale: 1 }).width),
      });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const task = page.render({ canvas, viewport });
      renderRef.current = task;
      try {
        await task.promise;
      } catch (error) {
        if (!cancelled)
          setMessage(
            error instanceof Error ? error.message : "Preview could not load.",
          );
      }
    })();
    return () => {
      cancelled = true;
      renderRef.current?.cancel();
    };
  }, [preview, regions]);

  async function load(file: File | undefined) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setMessage(
        "This PDF exceeds the 50 MB device-memory safety limit. Split the source PDF into smaller files.",
      );
      return;
    }
    const current = ++generation.current;
    setBusy(true);
    setMessage("Opening PDF…");
    setOutputUrl("");
    setRegions([]);
    setPreview(0);
    setReviewConfirmed(false);
    renderRef.current?.cancel();
    await pdfRef.current?.loadingTask.destroy();
    pdfRef.current = null;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
        throw new Error("Choose a valid PDF file.");
      bytesRef.current = bytes;
      const pdf = await openLabelPdf(bytes);
      if (current !== generation.current) {
        await pdf.loadingTask.destroy();
        return;
      }
      pdfRef.current = pdf;
      let found = await inspectLabels(pdf, split, (page) =>
        setMessage(`Inspecting page ${page} of ${pdf.numPages}…`),
      );
      const orderIds = [
        ...new Set(found.flatMap((r) => (r.orderId ? [r.orderId] : []))),
      ];
      const awbs = [...new Set(found.flatMap((r) => (r.awb ? [r.awb] : [])))];
      const known = new Map<
        string,
        { id: string; state: string; awb: string | null; handed_over: boolean }
      >();
      const byAwb = new Map<
        string,
        {
          id: string;
          state: string;
          awb: string | null;
          handed_over: boolean;
        }[]
      >();
      // Bound each request, not the document/order count. Every chunk is processed.
      for (
        let offset = 0;
        offset < Math.max(orderIds.length, awbs.length);
        offset += 250
      ) {
        const response = await fetch("/api/shipping/labels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderIds: orderIds.slice(offset, offset + 250),
            awbs: awbs.slice(offset, offset + 250),
          }),
        });
        if (!response.ok) throw new Error("Label verification failed");
        const value = (await response.json()) as {
          orders: {
            id: string;
            marketplace_order_id: string;
            state: string;
            awb: string | null;
            handed_over: boolean;
          }[];
        };
        for (const order of value.orders) {
          known.set(order.marketplace_order_id, order);
          if (order.awb) {
            const matches = byAwb.get(order.awb) ?? [];
            if (!matches.some((o) => o.id === order.id))
              byAwb.set(order.awb, [...matches, order]);
          }
        }
      }
      let selection: {
        all: boolean;
        ids: string[];
        exclude: string[];
        batch: string | null;
        date?: string;
      } | null = null;
      try {
        selection = JSON.parse(
          sessionStorage.getItem("reyo-label-selection") ?? "null",
        );
      } catch {
        /* A malformed local selection is ignored. */
      }
      let selectedIds = new Set(selection?.ids ?? []);
      if (selection?.all) {
        const collected: string[] = [];
        let page = 1;
        let total = Infinity;
        let loaded = 0;
        while (loaded < total) {
          const response = await fetch(
            `/api/shipping/queue?filter=${selection.batch ? "all" : "today"}&page=${page}${selection.batch ? `&batch=${encodeURIComponent(selection.batch)}` : ""}`,
            { cache: "no-store" },
          );
          if (!response.ok) throw new Error("Selection refresh failed");
          const queue = (await response.json()) as {
            date: string;
            total: number;
            orders: {
              id: string;
              state: string;
              awb?: string;
              items: unknown[];
              handedOver?: boolean;
            }[];
          };
          if (selection.all && selection.date !== queue.date)
            throw new Error("Day changed. Select today’s orders again.");
          if (!queue.orders.length) break;
          total = queue.total;
          loaded += queue.orders.length;
          collected.push(
            ...queue.orders
              .filter(
                (o) =>
                  o.state === "pending" &&
                  !o.handedOver &&
                  o.awb &&
                  o.items.length,
              )
              .map((o) => o.id),
          );
          page++;
        }
        selectedIds = new Set(
          collected.filter((id) => !selection?.exclude.includes(id)),
        );
      }
      const associated = new Set<string>();
      found = found.map((region) => {
        const awbMatches = region.awb ? (byAwb.get(region.awb) ?? []) : [];
        const order = region.orderId
          ? known.get(region.orderId)
          : awbMatches.length === 1
            ? awbMatches[0]
            : null;
        if (!region.orderId && awbMatches.length > 1)
          return {
            ...region,
            selected: false,
            kind: "review",
            reason:
              "AWB matches multiple orders. Confirm the exact order association before selecting.",
          };
        if (order?.state === "cancelled")
          return {
            ...region,
            selected: false,
            kind: "review",
            reason:
              "Cancelled order — excluded. Review before any manual override.",
          };
        if (order?.handed_over)
          return {
            ...region,
            selected: false,
            kind: "review",
            reason:
              "Already handed over / shipped — excluded to prevent accidental re-dispatch.",
          };
        if (region.kind === "label" && !order)
          return {
            ...region,
            selected: false,
            kind: "review",
            reason:
              "Label recognized but order not found in synced data. Review before selecting.",
          };
        if (order?.awb && region.awb && order.awb !== region.awb)
          return {
            ...region,
            selected: false,
            kind: "review",
            reason: "AWB differs from synced order. Review before selecting.",
          };
        if (selection && (!order || !selectedIds.has(order.id)))
          return {
            ...region,
            selected: false,
            reason: "Outside the selected shipping orders.",
          };
        if (order && region.kind === "label") associated.add(order.id);
        return region;
      });
      if (selection)
        setSelectionNotice(
          `Printing is scoped to ${selectedIds.size} selected orders. ${Math.max(0, selectedIds.size - associated.size)} selected orders have no verified label in this PDF. Review missing labels before completing the batch. Order statuses are rechecked when generating.`,
        );
      if (current !== generation.current) return;
      setRegions(found);
      setMessage(
        `${found.filter((r) => r.kind === "label").length} label regions · ${found.filter((r) => r.kind === "invoice").length} invoices excluded · ${found.filter((r) => r.kind === "review").length} need review. Review uncertain pages before generating.`,
      );
    } catch {
      if (current === generation.current)
        setMessage(
          "Could not process this PDF. It may be encrypted, damaged, or unsupported. Try an unencrypted Amazon PDF.",
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function generate() {
    if (!bytesRef.current) return;
    setBusy(true);
    setOutputUrl("");
    try {
      const identifiers = [
        ...new Set(
          regions.filter((r) => r.selected && r.orderId).map((r) => r.orderId!),
        ),
      ];
      const awbs = [
        ...new Set(
          regions.filter((r) => r.selected && r.awb).map((r) => r.awb!),
        ),
      ];
      const excluded = new Set<string>();
      const excludedAwbs = new Set<string>();
      for (
        let offset = 0;
        offset < Math.max(identifiers.length, awbs.length);
        offset += 250
      ) {
        const response = await fetch("/api/shipping/labels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderIds: identifiers.slice(offset, offset + 250),
            awbs: awbs.slice(offset, offset + 250),
          }),
        });
        if (!response.ok)
          throw new Error(
            "Could not recheck current order statuses. Retry before generating.",
          );
        const value = (await response.json()) as {
          orders: {
            marketplace_order_id: string;
            awb: string | null;
            state: string;
            handed_over: boolean;
          }[];
        };
        for (const order of value.orders)
          if (order.state === "cancelled" || order.handed_over) {
            excluded.add(order.marketplace_order_id);
            if (order.awb) excludedAwbs.add(order.awb);
          }
      }
      const blocked = (r: LabelRegion) =>
        Boolean(
          r.orderId
            ? excluded.has(r.orderId)
            : r.awb && excludedAwbs.has(r.awb),
        );
      if (regions.some((r) => r.selected && blocked(r))) {
        setRegions(
          regions.map((r) =>
            blocked(r)
              ? {
                  ...r,
                  selected: false,
                  kind: "review",
                  reason:
                    "Order cancelled or handed over since upload — excluded.",
                }
              : r,
          ),
        );
        throw new Error(
          "Order statuses changed. Cancelled/dispatched labels were excluded; review and generate again.",
        );
      }
      const bytes = await arrangeLabels(bytesRef.current, regions, mode);
      setOutputBytes(bytes);
      setOutputUrl(
        URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
        ),
      );
      setMessage(
        `${regions.filter((r) => r.selected).length} labels arranged. Print at Actual size / 100%, A4, with browser headers off.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "PDF generation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const visibleStart = Math.floor(preview / 50) * 50;
  const reviewCount = regions.filter(
    (r) =>
      r.kind === "review" ||
      r.duplicateOf !== undefined ||
      (!r.orderId && Boolean(r.awb)),
  ).length;
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Shipping label printer</h1>
        <Button asChild variant="outline">
          <Link href="/ship-today">Ship Today</Link>
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">
        PDFs stay on this device. Original text, vectors, and images are
        embedded without screenshot conversion. Image-only pages need manual
        review; no uncertain page is silently removed.
      </p>
      {selectionNotice ? (
        <p className="rounded border p-3 text-sm">
          {selectionNotice}
          <Button
            variant="outline"
            className="ml-2"
            onClick={() => {
              sessionStorage.removeItem("reyo-label-selection");
              setSelectionNotice(
                "Selection cleared. Re-upload to inspect all labels.",
              );
            }}
          >
            Clear order selection
          </Button>
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border p-4">
        <label className="space-y-2 text-sm font-semibold">
          Source layout
          <select
            aria-label="Source layout"
            disabled={busy}
            value={split}
            onChange={(e) => setSplit(Number(e.target.value) as 1 | 4)}
            className="block rounded border bg-background p-3"
          >
            <option value={1}>One label/page (original PDF)</option>
            <option value={4}>Already arranged 2×2 (split quadrants)</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-semibold">
          Upload Amazon PDF
          <input
            aria-label="Upload Amazon PDF"
            disabled={busy}
            type="file"
            accept="application/pdf,.pdf"
            className="block max-w-full text-sm"
            onChange={(e) => void load(e.target.files?.[0])}
          />
        </label>
        <label className="space-y-2 text-sm font-semibold">
          Output layout
          <select
            aria-label="Output layout"
            disabled={busy}
            value={mode}
            onChange={(e) => {
              setMode(Number(e.target.value) as 1 | 4);
              setOutputUrl("");
            }}
            className="block rounded border bg-background p-3"
          >
            <option value={4}>4 labels per A4</option>
            <option value={1}>1 label per A4</option>
          </select>
        </label>
      </div>
      <p role="status" className="rounded border p-3">
        {message || "Choose source layout, then upload a PDF."}
      </p>
      {regions.length ? (
        <>
          {reviewCount ? (
            <label className="flex items-start gap-3 rounded border border-amber-500 p-4">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                aria-label="Confirm uncertain page review"
                checked={reviewConfirmed}
                onChange={(event) => setReviewConfirmed(event.target.checked)}
              />
              <span>
                I reviewed all {reviewCount} uncertain/duplicate regions and
                selected every valid label. Unselected regions will not be
                printed.
              </span>
            </label>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={
                busy ||
                !regions.some((r) => r.selected) ||
                Boolean(reviewCount && !reviewConfirmed)
              }
              onClick={() => void generate()}
            >
              {busy
                ? "Processing…"
                : `Generate ${regions.filter((r) => r.selected).length} labels`}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setRegions(
                  regions.map((r) => ({
                    ...r,
                    selected: r.kind === "label" && r.duplicateOf === undefined,
                  })),
                );
                setOutputUrl("");
                setReviewConfirmed(false);
              }}
            >
              Select recognized labels
            </Button>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <section className="space-y-2" aria-label="Label extraction review">
              <p className="text-sm">
                Preview shows the original source page. For a 2×2 source, each
                row represents one quadrant.
              </p>
              {regions
                .slice(visibleStart, visibleStart + 50)
                .map((region, offset) => {
                  const index = visibleStart + offset;
                  return (
                    <div
                      key={index}
                      className={`flex items-start gap-3 rounded border p-3 ${preview === index ? "border-primary" : ""}`}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Include region ${index + 1}`}
                        disabled={busy}
                        checked={region.selected}
                        onChange={(e) => {
                          setRegions(
                            regions.map((r, i) =>
                              i === index
                                ? { ...r, selected: e.target.checked }
                                : r,
                            ),
                          );
                          setOutputUrl("");
                        }}
                        className="mt-1 size-5 shrink-0"
                      />
                      <button
                        className="min-w-0 text-left"
                        onClick={() => setPreview(index)}
                      >
                        <strong>
                          Page {region.page + 1}
                          {split === 4
                            ? ` · Quadrant ${(index % 4) + 1}`
                            : ""}{" "}
                          · {region.kind}
                        </strong>
                        <p className="break-all text-sm">
                          {region.orderId || "Order ID not extracted"}
                          {region.awb ? ` · AWB ${region.awb}` : ""}
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          {region.reason}
                        </p>
                      </button>
                    </div>
                  );
                })}
              <div className="flex justify-between">
                <Button
                  variant="outline"
                  disabled={visibleStart === 0}
                  onClick={() => setPreview(Math.max(0, visibleStart - 50))}
                >
                  Previous 50
                </Button>
                <Button
                  variant="outline"
                  disabled={visibleStart + 50 >= regions.length}
                  onClick={() => setPreview(visibleStart + 50)}
                >
                  Next 50
                </Button>
              </div>
            </section>
            <section aria-label="Source PDF preview">
              <p className="mb-2 font-semibold">
                Source page {(regions.at(preview)?.page ?? 0) + 1}
              </p>
              <canvas
                ref={canvasRef}
                className="h-auto w-full border bg-white"
              />
            </section>
          </div>
        </>
      ) : null}
      {outputUrl ? (
        <section className="space-y-3" aria-label="Print-ready PDF">
          {Capacitor.isNativePlatform() ? (
            <Button
              onClick={async () => {
                try {
                  if (outputBytes) await shareNativePdf(outputBytes, mode);
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "PDF sharing failed.",
                  );
                }
              }}
            >
              Save / share PDF
            </Button>
          ) : (
            <>
              <Button asChild>
                <a href={outputUrl} download={`Reyo-Pack-${mode}-per-A4.pdf`}>
                  Download print-ready PDF
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={outputUrl} target="_blank" rel="noreferrer">
                  Open PDF preview / Print
                </a>
              </Button>
            </>
          )}
          <p className="text-sm">
            Use your PDF viewer’s Print command. On mobile, download and open in
            your PDF viewer if the browser cannot preview it.
          </p>
          {outputBytes ? (
            <PdfSheetPreview key={outputUrl} bytes={outputBytes} />
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

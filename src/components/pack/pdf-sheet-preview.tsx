"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { openLabelPdf } from "@/lib/label-inspection";

export function PdfSheetPreview({ bytes }: { bytes: Uint8Array }) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let pdf: Awaited<ReturnType<typeof openLabelPdf>> | undefined;
    let render: { cancel(): void } | undefined;
    void (async () => {
      try {
        pdf = await openLabelPdf(bytes);
        if (cancelled) {
          await pdf.loadingTask.destroy();
          return;
        }
        setTotal(pdf.numPages);
        const sheet = await pdf.getPage(Math.min(page, pdf.numPages));
        if (cancelled || !canvas.current) return;
        const viewport = sheet.getViewport({
          scale: Math.min(1.5, 800 / sheet.getViewport({ scale: 1 }).width),
        });
        canvas.current.width = viewport.width;
        canvas.current.height = viewport.height;
        const task = sheet.render({ canvas: canvas.current, viewport });
        render = task;
        await task.promise;
      } catch {
        if (!cancelled)
          setError("Preview could not load. Download the PDF to view it.");
      }
    })();
    return () => {
      cancelled = true;
      render?.cancel();
      void pdf?.loadingTask.destroy();
    };
  }, [bytes, page]);
  return (
    <section
      aria-label="Generated sheet preview"
      className="max-w-2xl space-y-2"
    >
      <p className="font-semibold">
        Print preview · Sheet {page} of {total || "…"}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <canvas ref={canvas} className="h-auto w-full border bg-white" />
      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous sheet
        </Button>
        <Button
          variant="outline"
          disabled={page >= total}
          onClick={() => setPage(page + 1)}
        >
          Next sheet
        </Button>
      </div>
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importRowSchema } from "@/lib/validators";

type ParsedRow = Record<string, string>;
type PreviewRow = { index: number; raw: ParsedRow; valid: boolean; reason?: string; duplicate: boolean };

const requiredColumns = ["order_id", "marketplace_order_id", "marketplace", "sku", "product_title", "quantity"];
const template = "order_id,marketplace_order_id,awb,marketplace,sku,product_title,quantity,asin,variation\nRP-0001,408-1234567-1234567,AWB-0001,Amazon India,SKU-001,Example Product,1,B0EXAMPLE01,A4 Matte\n";

export function CsvImporter({ disabled }: { disabled: boolean }) {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const validRows = useMemo(() => rows.filter((row) => row.valid && !row.duplicate), [rows]);

  function selectFile(file: File | undefined) {
    setError(null); setResult(null); setRows([]);
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setError("CSV files must be 25 MB or smaller."); return; }
    setFileName(file.name);
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (value) => value.trim().toLowerCase(),
      complete: ({ data, meta, errors }) => {
        const missing = requiredColumns.filter((column) => !meta.fields?.includes(column));
        if (missing.length) { setError(`Missing columns: ${missing.join(", ")}`); return; }
        if (errors.length) { setError(errors[0].message); return; }
        const counts = new Map<string, number>();
        for (const row of data) counts.set(row.marketplace_order_id, (counts.get(row.marketplace_order_id) ?? 0) + 1);
        setRows(data.map((raw, index) => {
          const parsed = importRowSchema.safeParse(raw);
          return { index: index + 2, raw, valid: parsed.success, reason: parsed.success ? undefined : parsed.error.issues[0]?.message, duplicate: (counts.get(raw.marketplace_order_id) ?? 0) > 1 };
        }));
      },
    });
  }

  async function confirmImport() {
    setPending(true); setError(null); setResult(null);
    try {
      const payload = validRows.map((row) => importRowSchema.parse(row.raw));
      let imported = 0; let duplicates = 0;
      for (let offset = 0; offset < payload.length; offset += 1_000) {
        const response = await fetch("/api/admin/orders/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: payload.slice(offset, offset + 1_000) }) });
        const data = await response.json() as { imported?: number; duplicates?: number; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Import failed.");
        imported += data.imported ?? 0; duplicates += data.duplicates ?? 0;
      }
      setResult(`${imported} orders imported. ${duplicates} existing orders updated without duplication.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Import failed."); }
    finally { setPending(false); }
  }

  return <div className="space-y-5">
    {disabled ? <Alert><AlertCircle /><AlertTitle>Development adapter</AlertTitle><AlertDescription>CSV validation and preview work here, but confirmation is disabled so sample mode never writes production data.</AlertDescription></Alert> : null}
    <Card><CardContent className="p-6"><label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-muted/25 p-6 text-center hover:bg-muted/45"><FileSpreadsheet className="mb-3 size-10 text-primary" /><span className="font-semibold">Choose a CSV export</span><span className="mt-1 text-sm text-muted-foreground">All rows are imported in safe batches · up to 25 MB</span><Input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => selectFile(event.target.files?.[0])} /></label><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Required: {requiredColumns.join(", ")}. Optional: awb, asin, variation.</p><Button asChild variant="outline" size="sm"><a href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`} download="reyo-pack-orders-template.csv"><Download />Download template</a></Button></div></CardContent></Card>
    {error ? <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert> : null}
    {result ? <Alert><CheckCircle2 /><AlertDescription>{result}</AlertDescription></Alert> : null}
    {rows.length ? <><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{fileName}</h2><p className="text-sm text-muted-foreground">{validRows.length} ready · {rows.filter((row) => !row.valid).length} invalid · {rows.filter((row) => row.duplicate).length} duplicate rows</p></div><Button onClick={() => void confirmImport()} disabled={disabled || pending || !validRows.length}>{pending ? <Loader2 className="animate-spin" /> : <Upload />}Confirm {validRows.length} orders</Button></div><div className="max-h-[480px] overflow-auto rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Order ID</TableHead><TableHead>SKU</TableHead><TableHead>Product</TableHead><TableHead>Qty</TableHead><TableHead>Validation</TableHead></TableRow></TableHeader><TableBody>{rows.slice(0, 200).map((row) => <TableRow key={row.index}><TableCell>{row.index}</TableCell><TableCell className="mono-data">{row.raw.marketplace_order_id}</TableCell><TableCell className="mono-data">{row.raw.sku}</TableCell><TableCell>{row.raw.product_title}</TableCell><TableCell>{row.raw.quantity}</TableCell><TableCell><Badge variant={row.valid && !row.duplicate ? "default" : "destructive"}>{row.duplicate ? "Duplicate in file" : row.valid ? "Valid" : row.reason ?? "Invalid"}</Badge></TableCell></TableRow>)}</TableBody></Table></div></> : null}
  </div>;
}

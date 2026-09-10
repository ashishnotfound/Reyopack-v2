"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, CheckCircle2, Hash, Loader2, PackageCheck, RotateCcw, Search, Settings2, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { ConnectionStatus } from "@/components/pack/connection-status";
import { ProductArtwork } from "@/components/pack/product-artwork";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { normalizeAwbLookup } from "@/lib/awb";
import { formatDateTime } from "@/lib/format";
import { setSoundPreference, useSoundPreference } from "@/lib/sound-preference";
import type { PackOrder, Viewer } from "@/types/domain";

type Mode = "idle" | "loading" | "ready" | "packing" | "success" | "error";

export function PackWorkstation({ viewer }: { viewer: Viewer }) {
  const awbInputRef = useRef<HTMLInputElement>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<PackOrder | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [message, setMessage] = useState("AWB search ready");
  const soundEnabled = useSoundPreference();

  const focusAwbInput = useCallback(() => {
    window.requestAnimationFrame(() => awbInputRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    focusAwbInput();
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, [focusAwbInput]);

  const clearOrder = useCallback(() => {
    if (successTimer.current) clearTimeout(successTimer.current);
    setOrder(null);
    setQuery("");
    setMode("idle");
    setMessage("AWB search ready");
    focusAwbInput();
  }, [focusAwbInput]);

  const lookup = useCallback(async (rawQuery: string) => {
    const awb = normalizeAwbLookup(rawQuery);
    if (!awb || mode === "loading" || mode === "packing") return;
    if (!navigator.onLine) {
      setMode("error");
      setMessage("Connection lost. Reconnect before searching.");
      return;
    }

    setMode("loading");
    setMessage(`Looking up AWB ${awb}`);
    try {
      const response = await fetch(`/api/orders/lookup?q=${encodeURIComponent(awb)}`, { cache: "no-store" });
      const payload: { order?: PackOrder; error?: string } = await response.json();
      if (!response.ok || !payload.order) throw new Error(payload.error ?? "Order not found.");
      setOrder(payload.order);
      setQuery("");
      setMode("ready");
      setMessage(payload.order.state === "packed" ? "Order is already packed" : "Product ready");
    } catch (error) {
      setOrder(null);
      setMode("error");
      setMessage(error instanceof Error ? error.message : "Order lookup failed.");
    } finally {
      focusAwbInput();
    }
  }, [focusAwbInput, mode]);

  const markPacked = useCallback(async () => {
    if (!order || order.state !== "pending" || mode === "packing") return;
    if (!navigator.onLine) {
      setMode("error");
      setMessage("Connection lost. Nothing was marked packed.");
      return;
    }
    setMode("packing");
    setMessage("Registering packing action");
    try {
      const deviceId = getDeviceId();
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, userAgent: navigator.userAgent }),
      });
      const payload: { order?: PackOrder; alreadyPacked?: boolean; error?: string } = await response.json();
      if (!response.ok || !payload.order) throw new Error(payload.error ?? "Packing could not be confirmed.");
      setOrder(payload.order);
      setMode("success");
      setMessage(payload.alreadyPacked ? "Already packed" : `Packed by ${payload.order.packing?.workerDisplayName ?? viewer.displayName}`);
      if (soundEnabled && !payload.alreadyPacked) playSuccessTone();
      successTimer.current = setTimeout(clearOrder, 850);
    } catch (error) {
      setMode("error");
      setMessage(error instanceof Error ? error.message : "Packing failed. Nothing was changed.");
      toast.error("Packing was not confirmed");
      focusAwbInput();
    }
  }, [clearOrder, focusAwbInput, mode, order, soundEnabled, viewer.displayName]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        clearOrder();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearOrder]);

  const item = order?.items[0];
  const busy = mode === "loading" || mode === "packing";
  const confirmMode = !query.trim() && order?.state === "pending";

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between border-b bg-card px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><PackageCheck className="size-5" /></span>
          <div><p className="font-semibold leading-none">Reyo Pack</p><p className="mt-1 text-xs text-muted-foreground">Packing terminal</p></div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <ConnectionStatus />
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => { setSoundPreference(!soundEnabled); focusAwbInput(); }} aria-label={soundEnabled ? "Disable success sound" : "Enable success sound"}>{soundEnabled ? <Volume2 /> : <VolumeX />}</Button></TooltipTrigger><TooltipContent>Success sound</TooltipContent></Tooltip>
          <ThemeToggle />
          {viewer.role !== "worker" ? <Button asChild variant="ghost" size="icon"><Link href="/admin" aria-label="Open admin"><Settings2 /></Link></Button> : null}
        </div>
      </header>

      <section className="border-b bg-card/60 px-4 py-3 sm:px-6">
        <form className="mx-auto grid max-w-3xl gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); if (query.trim()) void lookup(query); else if (order?.state === "pending") void markPacked(); }}>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-primary" />
            <Input ref={awbInputRef} value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text" aria-label="Enter AWB number" placeholder="Enter the printed AWB number" className="h-12 pl-11 pr-10 text-base font-medium shadow-sm" disabled={busy} />
            {query ? <Button type="button" variant="ghost" size="icon-sm" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => { setQuery(""); focusAwbInput(); }} aria-label="Clear AWB input"><X /></Button> : null}
          </div>
          <Button type="submit" className="h-12 w-full px-4 sm:w-auto sm:px-6" disabled={busy || (!query.trim() && (!order || order.state !== "pending"))}>{mode === "loading" ? <Loader2 className="animate-spin" /> : confirmMode ? <PackageCheck /> : <Search />}<span>{confirmMode ? "Packed" : "Find AWB"}</span></Button>
        </form>
      </section>

      <section className="flex min-h-0 flex-1 p-4 sm:p-6">
        {mode === "success" ? (
          <div className="m-auto flex flex-col items-center text-center" role="status">
            <span className="mb-6 grid size-28 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_70px_color-mix(in_oklch,var(--primary)_35%,transparent)]"><Check className="size-14 stroke-[3]" /></span>
            <h1 className="text-5xl font-black tracking-[-0.06em]">PACKED</h1>
            <p className="mt-3 text-xl text-muted-foreground">{message}</p>
          </div>
        ) : order && item ? (
          <div className="mx-auto grid w-full max-w-6xl min-h-0 gap-5 lg:grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)]">
            <ProductArtwork src={item.imageUrl} title={item.title} sku={item.sku} />
            <Card className="min-h-0 border-border/80 shadow-xl shadow-black/5">
              <CardContent className="flex h-full flex-col p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-primary">Product</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{item.title}</h1></div>
                  <Badge variant={order.state === "packed" ? "default" : order.state === "cancelled" ? "destructive" : "secondary"} className="shrink-0 px-3 py-1.5 text-sm">{order.state.toUpperCase()}</Badge>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <DataBlock label="SKU" value={item.sku} mono />
                  <DataBlock label="Quantity" value={String(item.quantity)} large />
                  {item.variation ? <DataBlock label="Variation" value={item.variation} /> : null}
                  {item.location ? <DataBlock label="Location" value={item.location} /> : null}
                </div>
                {order.items.length > 1 ? <div className="mt-5 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4"><p className="font-semibold text-amber-700 dark:text-amber-300">Also pack {order.items.length - 1} additional product{order.items.length === 2 ? "" : "s"}</p><div className="mt-3 space-y-3">{order.items.slice(1).map((additional) => <div key={additional.id} className="rounded-lg border bg-background/70 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{additional.title}</p><p className="mono-data mt-1 text-xs text-muted-foreground">{additional.sku}{additional.variation ? ` · ${additional.variation}` : ""}</p>{additional.location ? <p className="mt-1 text-xs text-muted-foreground">{additional.location}</p> : null}</div><Badge variant="secondary" className="shrink-0">Qty {additional.quantity}</Badge></div></div>)}</div></div> : null}
                <Separator className="my-6" />
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Info label="Order ID" value={order.marketplaceOrderId} mono />
                  <Info label="AWB" value={order.awb ?? "Not assigned"} mono />
                  <Info label="Marketplace" value={order.marketplace} />
                  <Info label="Reyo Pack ID" value={order.orderNumber} mono />
                </dl>
                {order.packing ? (
                  <div className="mt-6 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div><p className="font-semibold">Packed by {order.packing.workerDisplayName}</p><p className="mt-1 text-sm text-muted-foreground">{formatDateTime(order.packing.packedAt)}</p></div>
                  </div>
                ) : null}
                <div className="mt-auto pt-7">
                  <Button aria-label={order.state === "packed" ? "Order already packed" : order.state === "cancelled" ? "Cancelled order cannot be packed" : "Mark order packed"} className="h-16 w-full text-xl font-black tracking-[0.12em]" onClick={() => void markPacked()} disabled={busy || order.state !== "pending"}>{mode === "packing" ? <Loader2 className="size-6 animate-spin" /> : order.state === "packed" ? <CheckCircle2 className="size-6" /> : <PackageCheck className="size-6" />}{order.state === "cancelled" ? "CANCELLED" : "PACKED"}</Button>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>Enter to confirm</span><Button variant="ghost" size="sm" onClick={clearOrder}><RotateCcw />Clear · Esc</Button></div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="m-auto flex max-w-lg flex-col items-center text-center">
            <span className={`mb-6 grid size-24 place-items-center rounded-2xl border bg-card shadow-lg ${mode === "error" ? "text-destructive" : "text-primary"}`}>{mode === "loading" ? <Loader2 className="size-11 animate-spin" /> : <Hash className="size-11" />}</span>
            <h1 className="text-3xl font-bold tracking-tight">{mode === "error" ? message : mode === "loading" ? "Finding order…" : "Ready for AWB"}</h1>
            <p className="mt-3 text-base text-muted-foreground">{mode === "error" ? "Check the AWB printed beneath the shipping-label barcode and try again." : "Enter the AWB number printed beneath the barcode on the Amazon shipping label."}</p>
            {mode === "error" ? <Button className="mt-5" variant="outline" onClick={clearOrder}><RotateCcw />Try another AWB</Button> : null}
            <div className="mt-8 rounded-lg border bg-card px-4 py-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">{viewer.displayName}</span> is packing · {message}</div>
          </div>
        )}
      </section>
    </main>
  );
}

function DataBlock({ label, value, mono, large }: { label: string; value: string; mono?: boolean; large?: boolean }) {
  return <div className="rounded-xl border bg-muted/45 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className={`mt-1.5 font-semibold ${mono ? "mono-data" : ""} ${large ? "text-3xl text-primary" : "text-base"}`}>{value}</p></div>;
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt><dd className={`mt-1 text-sm font-medium ${mono ? "mono-data" : ""}`}>{value}</dd></div>;
}

function getDeviceId() {
  const key = "reyo-pack-device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  localStorage.setItem(key, generated);
  return generated;
}

function playSuccessTone() {
  const AudioContextCtor = window.AudioContext;
  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(720, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(960, context.currentTime + 0.12);
  gain.gain.setValueAtTime(0.06, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.16);
  oscillator.addEventListener("ended", () => void context.close());
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SyncNowButton({ disabled = false, endpoint = "/api/admin/sync", label = "Sync now", onSynced }: { disabled?: boolean; endpoint?: string; label?: string; onSynced?: () => void | Promise<void> }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  async function sync() {
    setPending(true); setLastResult(null); setFailed(false);
    try {
      let more = true;
      while (more) {
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adapter: "amazon" }) });
        const data = await response.json() as { status?: string; fetched?: number; added?: number; updated?: number; unchanged?: number; failed?: number; pages?: number; hasMore?: boolean; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Sync failed.");
        const pageCount = data.pages ?? 0;
        const message = `Fetched ${data.fetched ?? 0} · Added ${data.added ?? 0} · Updated ${data.updated ?? 0} · Unchanged ${data.unchanged ?? 0} · Failed ${data.failed ?? 0} · ${pageCount} ${pageCount === 1 ? "page" : "pages"}${data.hasMore ? "; continuing…" : "."}`;
        setLastResult(message); router.refresh();
        await onSynced?.();
        more = Boolean(data.hasMore);
        if (!more && (data.status === "failed" || (data.failed ?? 0) > 0)) {
          setFailed(true);
          toast.error("Sync finished with failed orders. An admin can review the sync log.");
          return;
        }
      }
      toast.success("Marketplace sync completed");
    } catch (error) { const message = error instanceof Error ? error.message : "Marketplace sync failed."; setFailed(true); setLastResult(message); toast.error(message); }
    finally { setPending(false); }
  }
  return <div className="flex flex-wrap items-center gap-3"><Button onClick={() => void sync()} disabled={disabled || pending}>{pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}{pending ? "Syncing…" : label}</Button>{lastResult ? <span role="status" className={`inline-flex items-center gap-1.5 text-sm ${failed ? "text-destructive" : "text-muted-foreground"}`}>{failed ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4 text-primary" />}{lastResult}</span> : null}</div>;
}

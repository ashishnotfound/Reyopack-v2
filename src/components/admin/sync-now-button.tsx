"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SyncNowButton({ disabled = false }: { disabled?: boolean }) {
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  async function sync() {
    setPending(true); setLastResult(null);
    try {
      const response = await fetch("/api/admin/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adapter: "amazon" }) });
      const data = await response.json() as { imported?: number; pages?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Sync failed.");
      const message = `${data.imported ?? 0} orders synchronized across ${data.pages ?? 0} pages.`;
      setLastResult(message); toast.success("Marketplace sync completed");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Marketplace sync failed."); }
    finally { setPending(false); }
  }
  return <div className="flex flex-wrap items-center gap-3"><Button onClick={() => void sync()} disabled={disabled || pending}>{pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sync now</Button>{lastResult ? <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-primary" />{lastResult}</span> : null}</div>;
}

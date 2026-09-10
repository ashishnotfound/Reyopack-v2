import type { Metadata } from "next";
import { AlertTriangle, Clock3, DatabaseZap, RefreshCw, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { SyncNowButton } from "@/components/admin/sync-now-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { listMarketplaceSyncRuns } from "@/lib/data";
import { getIntegrationStatus } from "@/lib/marketplaces";

export const metadata: Metadata = { title: "Marketplace Sync" };

export default async function MarketplaceSyncPage() {
  const [integrations, runs] = await Promise.all([getIntegrationStatus(), listMarketplaceSyncRuns()]);
  const amazon = integrations.find((item) => item.key === "amazon")!;
  return <main><PageHeader title="Marketplace sync" description="Complete Amazon pagination with stable time windows, idempotent updates, and per-order error logging." />{!amazon.configured ? <Alert className="mb-5"><ShieldAlert /><AlertTitle>Amazon credentials needed</AlertTitle><AlertDescription>Add and verify the Amazon SP-API credentials in the Super Admin Integrations panel before running a production sync.</AlertDescription></Alert> : null}<div className="grid gap-4 md:grid-cols-3"><SyncFact icon={RefreshCw} label="Mode" value="Complete incremental" detail="Follows every Amazon continuation token" /><SyncFact icon={Clock3} label="Schedule" value="Every 30 min" detail="Uses a stable UTC window with overlap" /><SyncFact icon={DatabaseZap} label="Writes" value="Idempotent" detail="New orders are added; newer Amazon data updates existing orders" /></div><div className="my-6"><SyncNowButton disabled={!amazon.configured} /></div><section className="space-y-3"><h2 className="text-lg font-semibold">Recent sync runs</h2>{!runs.length ? <p className="rounded-xl border p-6 text-muted-foreground">No sync runs yet.</p> : runs.map((run) => <Card key={run.id}><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle className="text-base">{formatDateTime(run.startedAt)}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Version {run.version} · {run.pages} pages</p></div><Badge variant={run.status === "succeeded" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>{run.status}</Badge></CardHeader><CardContent><p className="text-sm">Fetched {run.fetched.toLocaleString()} · Added {run.added.toLocaleString()} · Updated {run.updated.toLocaleString()} · Unchanged {run.unchanged.toLocaleString()} · Failed {run.failed.toLocaleString()}</p>{run.error ? <p className="mt-3 flex gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{run.error}</p> : null}{run.failures.map((failure, index) => <p key={`${failure.stage}-${failure.page}-${failure.orderId ?? index}`} className="mt-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">Page {failure.page || "?"} · {failure.stage}{failure.orderId ? ` · Order ${failure.orderId}` : ""}: {failure.error}</p>)}</CardContent></Card>)}</section></main>;
}

function SyncFact({ icon: Icon, label, value, detail }: { icon: typeof RefreshCw; label: string; value: string; detail: string }) { return <Card><CardContent className="p-5"><Icon className="size-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p><p className="mt-2 text-sm text-muted-foreground">{detail}</p></CardContent></Card>; }

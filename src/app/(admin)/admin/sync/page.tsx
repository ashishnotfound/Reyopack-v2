import type { Metadata } from "next";
import { Clock3, DatabaseZap, RefreshCw, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { SyncNowButton } from "@/components/admin/sync-now-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { getIntegrationStatus } from "@/lib/marketplaces";

export const metadata: Metadata = { title: "Marketplace Sync" };

export default async function MarketplaceSyncPage() {
  const amazon = (await getIntegrationStatus()).find((item) => item.key === "amazon")!;
  return <main><PageHeader title="Marketplace sync" description="Incrementally import orders without duplicating existing products, order items, or order records." />{!amazon.configured ? <Alert className="mb-5"><ShieldAlert /><AlertTitle>Amazon credentials needed</AlertTitle><AlertDescription>Add and verify the Amazon SP-API credentials in the Super Admin Integrations panel before running a production sync.</AlertDescription></Alert> : null}<div className="grid gap-4 md:grid-cols-3"><SyncFact icon={RefreshCw} label="Mode" value="Incremental" detail="Continues from the last successful checkpoint" /><SyncFact icon={Clock3} label="Schedule" value="Every 30 min" detail="Supabase Cron invokes the protected sync route" /><SyncFact icon={DatabaseZap} label="Writes" value="Idempotent" detail="Database uniqueness constraints prevent duplicates" /></div><div className="mt-6"><SyncNowButton disabled={!amazon.configured} /></div></main>;
}

function SyncFact({ icon: Icon, label, value, detail }: { icon: typeof RefreshCw; label: string; value: string; detail: string }) { return <Card><CardContent className="p-5"><Icon className="size-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p><p className="mt-2 text-sm text-muted-foreground">{detail}</p></CardContent></Card>; }

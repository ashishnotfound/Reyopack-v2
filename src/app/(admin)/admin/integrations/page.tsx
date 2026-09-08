import type { Metadata } from "next";
import { Braces, CheckCircle2, CircleOff, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { AmazonCredentialsForm } from "@/components/admin/amazon-credentials-form";
import { PageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { getIntegrationStatus } from "@/lib/marketplaces";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const [viewer, integrations] = await Promise.all([
    requireRole(["admin", "super_admin"]),
    getIntegrationStatus(),
  ]);
  const amazon = integrations.find((integration) => integration.mode === "production")!;
  const canConfigure = viewer.role === "super_admin" && !isDemoMode();

  return <main><PageHeader title="Integrations" description="Server-only marketplace connections. Saved credential values are never returned to this page or stored in browser code." /><div className="grid gap-4 lg:grid-cols-2">{integrations.map((integration) => <Card key={integration.key} className={integration.mode === "development" ? "border-amber-400/35" : ""}><CardHeader className="flex-row items-start justify-between gap-4"><div><span className="mb-4 grid size-11 place-items-center rounded-lg bg-muted">{integration.mode === "production" ? <ShieldCheck className="text-primary" /> : <Braces className="text-amber-500" />}</span><CardTitle>{integration.name}</CardTitle><CardDescription className="mt-2">{integration.mode === "production" ? "Orders API v2026-01-01 · incremental sync · pagination · adaptive retry" : "Explicitly isolated sample data for local development and automated tests."}</CardDescription></div><Badge variant={integration.configured ? "default" : "secondary"}>{integration.configured ? <CheckCircle2 /> : <CircleOff />}{integration.configured ? "Configured" : "Not configured"}</Badge></CardHeader><CardContent><div className="flex items-start gap-3 rounded-lg border bg-muted/25 p-3"><LockKeyhole className="mt-0.5 size-4 text-muted-foreground" /><p className="text-sm text-muted-foreground">{integration.mode === "production" ? "LWA credentials are encrypted in Supabase Vault and loaded only by the server. Environment variables remain available as a fallback." : "REYO_PACK_DEMO_MODE must be exactly true. Keep it false in every production environment."}</p></div></CardContent></Card>)}</div>

    <Card className="mt-6">
      <CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary/10"><KeyRound className="size-5 text-primary" /></span><div><CardTitle role="heading" aria-level={2}>Amazon SP-API credentials</CardTitle><CardDescription>Update the long-lived Login with Amazon credentials used by automatic and manual order syncs.</CardDescription></div></div></CardHeader>
      <CardContent>
        {viewer.role === "super_admin" ? <AmazonCredentialsForm configured={amazon.configured} endpoint={amazon.endpoint} marketplaceIds={amazon.marketplaceIds} disabled={!canConfigure} /> : <Alert><LockKeyhole /><AlertTitle>Super Admin access required</AlertTitle><AlertDescription>Only a Super Admin can add or replace Amazon credentials.</AlertDescription></Alert>}
      </CardContent>
    </Card>

    <Alert className="mt-4"><ShieldCheck /><AlertTitle>You do not need to paste hourly access tokens</AlertTitle><AlertDescription>Amazon access tokens expire quickly, but Reyo Pack automatically requests a fresh one from the saved refresh token before syncing.</AlertDescription></Alert>
  </main>;
}

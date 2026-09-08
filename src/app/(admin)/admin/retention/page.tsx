import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, Database, History, Play, ShieldCheck } from "lucide-react";
import { runRetentionAction, updateRetentionAction } from "@/app/(admin)/admin/actions";
import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { isDemoMode } from "@/lib/config";
import { getRetentionStatus } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Data Retention" };

export default async function RetentionPage() {
  const [status, viewer] = await Promise.all([getRetentionStatus(), requireRole(["admin", "super_admin"])]); const demo = isDemoMode(); const canConfigure = viewer.role === "super_admin" && !demo;
  return <main><PageHeader title="Data retention" description="Terminal orders expire only after their packed or cancelled timestamp. Products, accounts, locations, and settings remain." action={<form action={runRetentionAction}><Button type="submit" variant="outline" disabled={demo}><Play />Run cleanup now</Button></form>} />{status.errorMessage ? <Alert variant="destructive" className="mb-5"><AlertTriangle /><AlertTitle>Latest cleanup failed</AlertTitle><AlertDescription>{status.errorMessage}</AlertDescription></Alert> : null}<div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Retention window" value={`${status.retentionDays} days`} icon={History} accent /><MetricCard label="Last cleanup" value={status.lastCleanup ? formatDateTime(status.lastCleanup) : "Never"} icon={Database} /><MetricCard label="Next cleanup" value={formatDateTime(status.nextCleanup)} icon={CalendarClock} /></div><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.65fr]"><Card><CardHeader className="flex-row items-start justify-between"><div><CardTitle>Latest cleanup</CardTitle><CardDescription>Safe to rerun; each execution aggregates statistics before deleting eligible operational records.</CardDescription></div><Badge variant={status.status === "succeeded" ? "default" : status.status === "failed" ? "destructive" : "secondary"}>{status.status}</Badge></CardHeader><CardContent><p className="mono-data text-4xl font-bold">{status.deleted}</p><p className="mt-1 text-sm text-muted-foreground">expired orders deleted in the latest run</p><div className="mt-5 flex gap-3 rounded-lg bg-muted/40 p-4"><ShieldCheck className="size-5 shrink-0 text-primary" /><p className="text-sm text-muted-foreground">Active orders are excluded even when they are older than the retention window. Cleanup records and anonymous daily totals are retained for operational monitoring.</p></div></CardContent></Card><Card><CardHeader><CardTitle>Retention setting</CardTitle><CardDescription>{viewer.role === "super_admin" ? "Seven days is the required minimum." : "Only a super admin can change this setting."}</CardDescription></CardHeader><CardContent><form action={updateRetentionAction} className="space-y-4"><div className="space-y-2"><Label htmlFor="retentionDays">Days after terminal state</Label><Input id="retentionDays" name="retentionDays" type="number" min={7} max={90} defaultValue={status.retentionDays} disabled={!canConfigure} /></div><Button className="w-full" disabled={!canConfigure}>Save retention</Button></form></CardContent></Card></div></main>;
}

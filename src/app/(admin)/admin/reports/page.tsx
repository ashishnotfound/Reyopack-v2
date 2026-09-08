import type { Metadata } from "next";
import { Boxes, PackageCheck } from "lucide-react";
import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReports } from "@/lib/data";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const report = await getReports();
  return <main><PageHeader title="Reports" description="Operational totals use live seven-day records; long-term history keeps only anonymous daily aggregates." /><div className="grid gap-4 sm:grid-cols-2"><MetricCard label="Orders packed today" value={report.packedOrders} icon={PackageCheck} accent /><MetricCard label="Units packed today" value={report.units} icon={Boxes} /></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><Breakdown title="Orders by marketplace" rows={report.byMarketplace} /><Breakdown title="Top packed SKUs" rows={report.topSkus} /></div></main>;
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) { const max = Math.max(...rows.map((row) => row.value), 1); return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-4">{rows.length ? rows.map((row) => <div key={row.label}><div className="mb-1.5 flex justify-between text-sm"><span className="mono-data font-medium">{row.label}</span><span className="mono-data text-muted-foreground">{row.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(row.value / max) * 100}%` }} /></div></div>) : <p className="text-sm text-muted-foreground">No packing activity today.</p>}</CardContent></Card>; }

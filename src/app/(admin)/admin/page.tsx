import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, Boxes, PackageCheck, PackageOpen, Users } from "lucide-react";
import { ActivityTable } from "@/components/admin/activity-table";
import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RealtimeDashboardRefresh } from "@/components/admin/realtime-dashboard-refresh";
import { hasSupabaseConfig, isDemoMode } from "@/lib/config";
import { getDashboardData } from "@/lib/data";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const { stats, activity, workerCounts } = await getDashboardData();
  const completion = stats.total ? Math.round((stats.packed / stats.total) * 100) : 0;
  return <main><RealtimeDashboardRefresh enabled={hasSupabaseConfig() && !isDemoMode()} /><PageHeader title="Operations dashboard" description="Today’s packing workload, workers, and latest completed orders." action={<Button asChild><Link href="/pack"><PackageCheck />Open packing terminal</Link></Button>} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><MetricCard label="Total orders" value={stats.total} icon={Boxes} /><MetricCard label="Packed" value={stats.packed} icon={PackageCheck} accent /><MetricCard label="Remaining" value={stats.remaining} icon={PackageOpen} /><MetricCard label="Cancelled" value={stats.cancelled} icon={Ban} /><MetricCard label="Active workers" value={stats.activeWorkers} icon={Users} /></section>
    <section className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">
      <div><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Recent packing</h2><Button asChild variant="ghost" size="sm"><Link href="/admin/activity">View all<ArrowRight /></Link></Button></div><ActivityTable rows={activity.slice(0, 7)} compact /></div>
      <div className="space-y-4"><Card><CardHeader><CardTitle>Today’s progress</CardTitle></CardHeader><CardContent><div className="mb-2 flex items-end justify-between"><span className="mono-data text-4xl font-bold">{completion}%</span><span className="text-sm text-muted-foreground">{stats.packed} of {stats.total}</span></div><Progress value={completion} /></CardContent></Card><Card><CardHeader><CardTitle>Worker output</CardTitle></CardHeader><CardContent className="space-y-4">{workerCounts.length ? workerCounts.map((worker) => <div key={worker.name}><div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">{worker.name}</span><span className="mono-data text-muted-foreground">{worker.count}</span></div><Progress value={stats.packed ? (worker.count / stats.packed) * 100 : 0} /></div>) : <p className="text-sm text-muted-foreground">No packing actions today.</p>}</CardContent></Card></div>
    </section></main>;
}

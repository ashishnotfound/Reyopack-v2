import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, CalendarClock, PackageCheck, PackageOpen, Truck } from "lucide-react";
import { ActivityTable } from "@/components/admin/activity-table";
import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RealtimeDashboardRefresh } from "@/components/admin/realtime-dashboard-refresh";
import { SyncNowButton } from "@/components/admin/sync-now-button";
import { hasSupabaseConfig, isDemoMode } from "@/lib/config";
import { getDashboardData, getOrderOverview } from "@/lib/data";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const [{ stats, activity, workerCounts }, overview] = await Promise.all([getDashboardData(), getOrderOverview()]);
  const completion = overview.goingToday ? Math.round((overview.packedToday / overview.goingToday) * 100) : 0;
  return <main><RealtimeDashboardRefresh enabled={hasSupabaseConfig() && !isDemoMode()} /><PageHeader title="Operations dashboard" description="Today’s packing workload, workers, and latest completed orders." action={<div className="flex flex-wrap gap-2"><SyncNowButton /><Button asChild><Link href="/pack"><PackageCheck />Open packing terminal</Link></Button></div>} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Link href="/admin/orders?filter=today"><MetricCard label="Going Today" value={overview.goingToday} icon={CalendarClock} /></Link><Link href="/admin/orders?filter=left"><MetricCard label="Left to Pack" value={overview.leftToPack} icon={PackageOpen} /></Link><Link href="/admin/orders?filter=packed"><MetricCard label="Packed Today" value={overview.packedToday} icon={PackageCheck} accent /></Link><Link href="/admin/orders?filter=waiting"><MetricCard label="Waiting for Pickup" value={overview.waitingForPickup} icon={Truck} /></Link><Link href="/admin/orders?filter=active"><MetricCard label="Total Orders" value={overview.totalOrders} icon={Boxes} /></Link></section>
    <section className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">
      <div><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Recent packing</h2><Button asChild variant="ghost" size="sm"><Link href="/admin/activity">View all<ArrowRight /></Link></Button></div><ActivityTable rows={activity.slice(0, 7)} compact /></div>
      <div className="space-y-4"><Card><CardHeader><CardTitle>Today’s progress</CardTitle></CardHeader><CardContent><div className="mb-2 flex items-end justify-between"><span className="mono-data text-4xl font-bold">{completion}%</span><span className="text-sm text-muted-foreground">{overview.packedToday} of {overview.goingToday}</span></div><Progress value={completion} /></CardContent></Card><Card><CardHeader><CardTitle>Worker output</CardTitle></CardHeader><CardContent className="space-y-4">{workerCounts.length ? workerCounts.map((worker) => <div key={worker.name}><div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">{worker.name}</span><span className="mono-data text-muted-foreground">{worker.count}</span></div><Progress value={stats.packed ? (worker.count / stats.packed) * 100 : 0} /></div>) : <p className="text-sm text-muted-foreground">No packing actions today.</p>}</CardContent></Card></div>
    </section></main>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Boxes, CalendarClock, CalendarX2, PackageCheck, PackageOpen, Truck } from "lucide-react";
import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { RealtimeDashboardRefresh } from "@/components/admin/realtime-dashboard-refresh";
import { SyncNowButton } from "@/components/admin/sync-now-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { hasSupabaseConfig, isDemoMode } from "@/lib/config";
import { getOrderOverview } from "@/lib/data";

export const metadata: Metadata = { title: "Order Overview / Pickup" };

export default async function PickupOverviewPage() {
  const overview = await getOrderOverview();
  return <main>
    <RealtimeDashboardRefresh enabled={hasSupabaseConfig() && !isDemoMode()} />
    <PageHeader title="Order Overview / Pickup" description={`Amazon ship-by workload for ${overview.date}. Counts refresh after packing, sync, or status changes.`} action={<SyncNowButton />} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Link href="/admin/orders?filter=today"><MetricCard label="Going Today" value={overview.goingToday} icon={CalendarClock} /></Link>
      <Link href="/admin/orders?filter=left"><MetricCard label="Left to Pack" value={overview.leftToPack} icon={PackageOpen} /></Link>
      <Link href="/admin/orders?filter=packed"><MetricCard label="Packed Today" value={overview.packedToday} icon={PackageCheck} accent /></Link>
      <Link href="/admin/orders?filter=waiting"><MetricCard label="Waiting for Pickup" value={overview.waitingForPickup} icon={Truck} /></Link>
      <Link href="/admin/orders?filter=active"><MetricCard label="Total Orders" value={overview.totalOrders} icon={Boxes} /></Link>
    </section>
    <section className="mt-5 grid gap-4 sm:grid-cols-2">
      <Card><CardContent className="flex items-center justify-between p-5"><div className="flex items-center gap-3"><AlertTriangle className="text-amber-500" /><div><p className="font-semibold">Overdue</p><p className="text-sm text-muted-foreground">Ship-by date is before today</p></div></div><div className="flex items-center gap-3"><span className="mono-data text-3xl font-bold">{overview.overdue}</span><Button asChild variant="outline" size="sm"><Link href="/admin/orders?filter=overdue">View</Link></Button></div></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between p-5"><div className="flex items-center gap-3"><CalendarX2 className="text-muted-foreground" /><div><p className="font-semibold">Missing Date</p><p className="text-sm text-muted-foreground">Amazon did not provide a ship-by date</p></div></div><div className="flex items-center gap-3"><span className="mono-data text-3xl font-bold">{overview.missingDate}</span><Button asChild variant="outline" size="sm"><Link href="/admin/orders?filter=missing">View</Link></Button></div></CardContent></Card>
    </section>
  </main>;
}

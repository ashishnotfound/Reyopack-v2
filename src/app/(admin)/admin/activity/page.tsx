import type { Metadata } from "next";
import { Radio } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { RealtimeActivity } from "@/components/admin/realtime-activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { hasSupabaseConfig, isDemoMode } from "@/lib/config";
import { listPackingActivity } from "@/lib/data";
import { workerIdSchema } from "@/lib/validators";

export const metadata: Metadata = { title: "Packing Activity" };

export default async function PackingActivityPage({ searchParams }: { searchParams: Promise<{ worker?: string }> }) {
  const workerParam = (await searchParams).worker;
  const workerId = workerIdSchema.safeParse(workerParam).success ? workerParam : undefined;
  const rows = await listPackingActivity(200, workerId);
  return <main><PageHeader title="Packing activity" description={workerId ? "Recent packing completed by the selected worker." : "A live, attributable record of every completed packing action."} action={<div className="flex items-center gap-2">{workerId ? <Button asChild variant="outline" size="sm"><Link href="/admin/activity">Clear worker filter</Link></Button> : null}<Badge variant="secondary"><Radio className="text-primary" />Live updates</Badge></div>} /><RealtimeActivity initialRows={rows} enabled={hasSupabaseConfig() && !isDemoMode()} workerId={workerId} /></main>;
}

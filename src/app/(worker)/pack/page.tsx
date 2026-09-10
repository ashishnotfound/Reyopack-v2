import type { Metadata } from "next";
import { DemoBanner } from "@/components/demo-banner";
import { PackWorkstation } from "@/components/pack/pack-workstation";
import { requireViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { lookupOrder } from "@/lib/data";

export const metadata: Metadata = { title: "Pack" };
export const dynamic = "force-dynamic";

export default async function PackPage({ searchParams }: { searchParams: Promise<{ awb?: string }> }) {
  const viewer = await requireViewer();
  const { awb } = await searchParams;
  const result = awb && awb.length <= 160 ? await lookupOrder(awb) : null;
  return <>{isDemoMode() ? <DemoBanner /> : null}<PackWorkstation key={awb ?? "scanner"} viewer={viewer} initialOrder={result?.data ?? null} /></>;
}

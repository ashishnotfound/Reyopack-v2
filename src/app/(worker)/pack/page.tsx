import type { Metadata } from "next";
import { DemoBanner } from "@/components/demo-banner";
import { PackWorkstation } from "@/components/pack/pack-workstation";
import { requireViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";

export const metadata: Metadata = { title: "Pack" };
export const dynamic = "force-dynamic";

export default async function PackPage() {
  const viewer = await requireViewer();
  return <>{isDemoMode() ? <DemoBanner /> : null}<PackWorkstation viewer={viewer} /></>;
}

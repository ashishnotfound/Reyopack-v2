import { requireViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { WorkerWorkload } from "@/components/pack/worker-workload";

export const metadata = { title: "Order status" };

export default async function WorkloadPage() {
  const viewer = await requireViewer();
  return <WorkerWorkload viewer={viewer} realtime={!isDemoMode()} />;
}

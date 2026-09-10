import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  redirect(viewer.role === "worker" ? "/workload" : "/admin");
}

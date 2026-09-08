import { AdminShell } from "@/components/admin/admin-shell";
import { DemoBanner } from "@/components/demo-banner";
import { requireRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireRole(["admin", "super_admin"]);
  return <>{isDemoMode() ? <DemoBanner /> : null}<AdminShell viewer={viewer}>{children}</AdminShell></>;
}

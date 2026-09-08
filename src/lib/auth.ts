import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { hasSupabaseConfig, isDemoMode } from "@/lib/config";
import { DEMO_USER } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Viewer } from "@/types/domain";

export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (isDemoMode()) return DEMO_USER;
  if (!hasSupabaseConfig()) return null;

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const subject = claimsData?.claims?.sub;
  if (claimsError || !subject) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, email, active, user_roles(role)")
    .eq("id", subject)
    .single();

  if (!profile || !profile.active) return null;
  const roleRecord = Array.isArray(profile.user_roles)
    ? profile.user_roles[0]
    : profile.user_roles;

  return {
    id: profile.id,
    displayName: profile.display_name,
    email: profile.email,
    active: profile.active,
    role: (roleRecord?.role ?? "worker") as AppRole,
  };
});

export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requireRole(roles: AppRole[]) {
  const viewer = await requireViewer();
  if (!roles.includes(viewer.role)) redirect("/pack");
  return viewer;
}

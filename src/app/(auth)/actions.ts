"use server";

import { redirect } from "next/navigation";
import { appUrl, hasSupabaseConfig, isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; success?: string };

export async function loginAction(_: AuthState, formData: FormData): Promise<AuthState> {
  if (isDemoMode()) redirect("/pack");
  if (!hasSupabaseConfig()) return { error: "Supabase has not been configured for this deployment." };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !signIn.user) return { error: "The email or password is incorrect." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("active, user_roles(role)")
    .eq("id", signIn.user.id)
    .maybeSingle();
  if (profileError || !profile?.active) {
    await supabase.auth.signOut();
    return { error: "This account is inactive. Ask an administrator for access." };
  }
  const roles = profile.user_roles as Array<{ role: string }> | null;
  const role = roles?.[0]?.role;
  redirect(role === "worker" ? "/pack" : "/admin");
}

export async function logoutAction() {
  if (!isDemoMode() && hasSupabaseConfig()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function requestPasswordResetAction(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!hasSupabaseConfig()) return { error: "Supabase has not been configured for this deployment." };
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password`,
  });
  return error
    ? { error: "We could not send the reset email. Try again." }
    : { success: "If this account exists, a reset link has been sent." };
}

export async function updatePasswordAction(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!hasSupabaseConfig()) return { error: "Supabase has not been configured for this deployment." };
  const password = String(formData.get("password") ?? "");
  if (password.length < 12) return { error: "Use at least 12 characters." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "The password could not be updated. Request a new reset link." };
  redirect("/pack");
}

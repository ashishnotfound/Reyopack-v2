import type { Metadata } from "next";
import { loginAction } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { DemoBanner } from "@/components/demo-banner";
import { isDemoMode } from "@/lib/config";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      {isDemoMode() ? <DemoBanner /> : null}
      <AuthShell title="Welcome back" description="Sign in with your Reyo Store packing account.">
        <AuthForm action={loginAction} mode="login" />
      </AuthShell>
    </>
  );
}

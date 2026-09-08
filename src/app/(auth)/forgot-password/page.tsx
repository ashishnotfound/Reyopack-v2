import type { Metadata } from "next";
import { requestPasswordResetAction } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return <AuthShell title="Reset password" description="We’ll email a secure link to your account."><AuthForm action={requestPasswordResetAction} mode="forgot" /></AuthShell>;
}

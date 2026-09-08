import type { Metadata } from "next";
import { updatePasswordAction } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Choose password" };

export default function ResetPasswordPage() {
  return <AuthShell title="Choose a new password" description="Your new password will apply to every Reyo Pack terminal."><AuthForm action={updatePasswordAction} mode="reset" /></AuthShell>;
}

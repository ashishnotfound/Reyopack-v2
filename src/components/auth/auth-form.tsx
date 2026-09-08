"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2, LogIn } from "lucide-react";
import type { AuthState } from "@/app/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthAction = (state: AuthState, data: FormData) => Promise<AuthState>;

export function AuthForm({
  action,
  mode,
}: {
  action: AuthAction;
  mode: "login" | "forgot" | "reset";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const login = mode === "login";
  const forgot = mode === "forgot";

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      ) : null}

      {mode !== "reset" ? (
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </div>
      ) : null}
      {login || mode === "reset" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{mode === "reset" ? "New password" : "Password"}</Label>
            {login ? <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground">Forgot password?</Link> : null}
          </div>
          <Input id="password" name="password" type="password" autoComplete={mode === "reset" ? "new-password" : "current-password"} minLength={mode === "reset" ? 12 : undefined} required />
          {mode === "reset" ? <p className="text-sm text-muted-foreground">Use at least 12 characters.</p> : null}
        </div>
      ) : null}

      <Button className="h-11 w-full" type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
        {login ? "Sign in" : forgot ? "Send reset link" : "Save password"}
      </Button>
      {!login ? <Link href="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">Back to sign in</Link> : null}
    </form>
  );
}

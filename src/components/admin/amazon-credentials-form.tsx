"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Save } from "lucide-react";
import { updateAmazonCredentialsAction, type AmazonCredentialActionState } from "@/app/(admin)/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AmazonCredentialsForm({
  configured,
  endpoint,
  marketplaceIds,
  disabled,
}: {
  configured: boolean;
  endpoint: string;
  marketplaceIds: string[];
  disabled: boolean;
}) {
  const initialState: AmazonCredentialActionState = {};
  const [state, formAction, pending] = useActionState(updateAmazonCredentialsAction, initialState);
  const secretPlaceholder = configured ? "Saved securely — enter a replacement only" : "Required";

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <Alert variant="destructive"><AlertCircle /><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      {state.success ? <Alert><CheckCircle2 /><AlertDescription>{state.success}</AlertDescription></Alert> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <CredentialField id="clientId" label="LWA client ID" placeholder={secretPlaceholder} required={!configured} disabled={disabled || pending} />
        <CredentialField id="clientSecret" label="LWA client secret" placeholder={secretPlaceholder} required={!configured} disabled={disabled || pending} />
      </div>
      <CredentialField id="refreshToken" label="LWA refresh token" placeholder={secretPlaceholder} required={!configured} disabled={disabled || pending} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="endpoint">Selling Partner API region</Label>
          <Select name="endpoint" defaultValue={endpoint} disabled={disabled || pending} required>
            <SelectTrigger id="endpoint" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="https://sellingpartnerapi-eu.amazon.com">Europe, Middle East &amp; India</SelectItem>
              <SelectItem value="https://sellingpartnerapi-fe.amazon.com">Far East (Japan, Australia &amp; Singapore)</SelectItem>
              <SelectItem value="https://sellingpartnerapi-na.amazon.com">North America</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="marketplaceIds">Marketplace IDs</Label>
          <Input id="marketplaceIds" name="marketplaceIds" className="mono-data" defaultValue={marketplaceIds.join(", ")} placeholder="A21TJRUUN4KGV" required disabled={disabled || pending} />
          <p className="text-xs text-muted-foreground">Separate multiple marketplace IDs with commas.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/25 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">Reyo Pack verifies the refresh token, marketplace IDs, and region with Amazon before replacing the encrypted saved values.</p>
        </div>
        <Button type="submit" className="shrink-0" disabled={disabled || pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          {pending ? "Verifying…" : "Save & verify"}
        </Button>
      </div>
    </form>
  );
}

function CredentialField({
  id,
  label,
  placeholder,
  required,
  disabled,
}: {
  id: "clientId" | "clientSecret" | "refreshToken";
  label: string;
  placeholder: string;
  required: boolean;
  disabled: boolean;
}) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} name={id} type="password" className="mono-data" placeholder={placeholder} required={required} disabled={disabled} autoComplete="off" /></div>;
}

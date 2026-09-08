import type { Metadata } from "next";
import { CheckCircle2, CircleOff, Database, HardDrive, Radio, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { hasSupabaseConfig, isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "System Health" };

export default async function SystemHealthPage() {
  const configured = hasSupabaseConfig(); const demo = isDemoMode();
  let database = false;
  if (configured && !demo) { const supabase = await createClient(); const { error } = await supabase.from("system_settings").select("key", { head: true, count: "exact" }); database = !error; }
  const states = demo ? [{ label: "Development adapter", detail: "Isolated sample records are active", icon: Database, ok: true }, { label: "Supabase database", detail: "Not contacted while development adapter is active", icon: Database, ok: false }, { label: "Supabase Auth + RLS", detail: "Production policies are defined in the migration", icon: ShieldCheck, ok: true }, { label: "Realtime publication", detail: "Packing events are included in supabase_realtime", icon: Radio, ok: true }, { label: "Artwork storage", detail: "Private product-artwork bucket with admin-only writes", icon: HardDrive, ok: true }] : [{ label: "Supabase database", detail: database ? "Authenticated query succeeded" : "Connection check failed", icon: Database, ok: database }, { label: "Supabase Auth + RLS", detail: configured ? "Cookie session and server authorization configured" : "Environment variables missing", icon: ShieldCheck, ok: configured }, { label: "Realtime publication", detail: configured ? "Client subscription enabled" : "Environment variables missing", icon: Radio, ok: configured }, { label: "Artwork storage", detail: configured ? "Storage policies installed by migration" : "Environment variables missing", icon: HardDrive, ok: configured }];
  return <main><PageHeader title="System health" description="Production dependencies and the latest live connectivity check." /><div className="grid gap-4 md:grid-cols-2">{states.map((state) => <Card key={state.label}><CardContent className="flex items-center gap-4 p-5"><span className="grid size-11 place-items-center rounded-lg bg-muted"><state.icon className="size-5 text-primary" /></span><div className="min-w-0 flex-1"><p className="font-semibold">{state.label}</p><p className="mt-1 text-sm text-muted-foreground">{state.detail}</p></div><Badge variant={state.ok ? "default" : "secondary"}>{state.ok ? <CheckCircle2 /> : <CircleOff />}{state.ok ? "Healthy" : demo ? "Bypassed" : "Needs attention"}</Badge></CardContent></Card>)}</div></main>;
}

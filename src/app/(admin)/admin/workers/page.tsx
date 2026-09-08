import type { Metadata } from "next";
import Link from "next/link";
import { History, Plus, Power, Save, Users } from "lucide-react";
import { createWorkerAction, setWorkerActiveAction, setWorkerRoleAction } from "@/app/(admin)/admin/actions";
import { PageHeader } from "@/components/admin/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isDemoMode } from "@/lib/config";
import { listWorkers } from "@/lib/data";
import { initials } from "@/lib/format";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Workers" };

export default async function WorkersPage() {
  const [workers, viewer] = await Promise.all([listWorkers(), requireRole(["admin", "super_admin"])]); const demo = isDemoMode();
  return <main><PageHeader title="Workers" description="Accounts, roles, availability, and today’s attributable packing output." /><div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
    <section className="space-y-3">{workers.map((worker) => <Card key={worker.id}><CardContent className="flex flex-col gap-4 p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><Avatar className="size-11"><AvatarFallback>{initials(worker.displayName)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{worker.displayName}</p><Badge variant="secondary" className="capitalize">{worker.role.replace("_", " ")}</Badge><Badge variant={worker.active ? "default" : "outline"}>{worker.active ? "Active" : "Inactive"}</Badge></div><p className="truncate text-sm text-muted-foreground">{worker.email}</p></div><div className="sm:text-right"><p className="mono-data text-2xl font-bold">{worker.packedToday}</p><p className="text-xs text-muted-foreground">packed today</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href={`/admin/activity?worker=${worker.id}`}><History />History</Link></Button><form action={setWorkerActiveAction.bind(null, worker.id, !worker.active)}><Button type="submit" variant="outline" size="sm" disabled={demo}><Power />{worker.active ? "Disable" : "Reactivate"}</Button></form></div></div>{viewer.role === "super_admin" ? <form action={setWorkerRoleAction.bind(null, worker.id)} className="flex items-center gap-2 border-t pt-4"><Select name="role" defaultValue={worker.role} disabled={demo}><SelectTrigger className="w-full sm:w-48" aria-label={`Role for ${worker.displayName}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="worker">Worker</SelectItem><SelectItem value="admin">Admin</SelectItem><SelectItem value="super_admin">Super Admin</SelectItem></SelectContent></Select><Button type="submit" variant="secondary" size="sm" disabled={demo}><Save />Update role</Button></form> : null}</CardContent></Card>)}{!workers.length ? <Card><CardContent className="flex min-h-48 flex-col items-center justify-center text-muted-foreground"><Users className="mb-2 size-8" />No worker accounts</CardContent></Card> : null}</section>
    <Card><CardHeader><CardTitle>Create worker</CardTitle><CardDescription>{demo ? "Changes are disabled in the development adapter." : "The password is sent only to Supabase Auth and is never stored here."}</CardDescription></CardHeader><CardContent><form action={createWorkerAction} className="space-y-4"><WorkerField label="Display name" name="displayName" type="text" disabled={demo} /><WorkerField label="Email" name="email" type="email" disabled={demo} /><WorkerField label="Temporary password" name="password" type="password" disabled={demo} /><div className="space-y-2"><Label htmlFor="role">Role</Label><Select name="role" defaultValue="worker" disabled={demo}><SelectTrigger id="role" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="worker">Worker</SelectItem><SelectItem value="admin">Admin</SelectItem>{viewer.role === "super_admin" ? <SelectItem value="super_admin">Super Admin</SelectItem> : null}</SelectContent></Select></div><Button type="submit" className="w-full" disabled={demo}><Plus />Create account</Button></form></CardContent></Card>
  </div></main>;
}

function WorkerField({ label, name, type, disabled }: { label: string; name: string; type: string; disabled: boolean }) { return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} disabled={disabled} required minLength={name === "password" ? 12 : undefined} autoComplete="off" /></div>; }

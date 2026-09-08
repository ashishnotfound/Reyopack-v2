import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({ label, value, detail, icon: Icon, accent = false }: { label: string; value: number | string; detail?: string; icon: LucideIcon; accent?: boolean }) {
  return <Card className={accent ? "border-primary/35 bg-primary/8" : ""}><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mono-data mt-2 text-3xl font-bold tracking-tight">{value}</p>{detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}</div><span className={`grid size-10 place-items-center rounded-lg ${accent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Icon className="size-5" /></span></CardContent></Card>;
}

import Link from "next/link";
import { ArrowRight, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTime } from "@/lib/format";
import type { PackingActivity } from "@/types/domain";

export function ActivityTable({ rows, compact = false }: { rows: PackingActivity[]; compact?: boolean }) {
  if (!rows.length) return <Card><CardContent className="flex min-h-48 flex-col items-center justify-center text-center"><PackageCheck className="mb-3 size-8 text-muted-foreground" /><p className="font-medium">No packing activity yet</p><p className="mt-1 text-sm text-muted-foreground">New packing actions will appear here immediately.</p></CardContent></Card>;
  return <div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead>Worker</TableHead><TableHead>Action</TableHead><TableHead>Order ID</TableHead>{compact ? null : <TableHead>Product</TableHead>}<TableHead className="text-right">Time</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.workerDisplayName}</TableCell><TableCell><Badge variant="secondary"><PackageCheck />Packed</Badge></TableCell><TableCell><Link className="mono-data inline-flex items-center gap-1.5 font-medium hover:text-primary" href={`/admin/orders/${row.orderId}`}>{row.marketplaceOrderId}<ArrowRight className="size-3.5" /></Link></TableCell>{compact ? null : <TableCell><p className="max-w-xs truncate font-medium">{row.productTitle}</p><p className="mono-data text-xs text-muted-foreground">{row.sku} · Qty {row.quantity}</p></TableCell>}<TableCell className="mono-data text-right text-muted-foreground">{formatTime(row.packedAt)}</TableCell></TableRow>)}</TableBody></Table></div>;
}

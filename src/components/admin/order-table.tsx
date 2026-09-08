import Link from "next/link";
import { ArrowRight, PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PackOrder } from "@/types/domain";

export function OrderTable({ orders }: { orders: PackOrder[] }) {
  if (!orders.length) return <Card><CardContent className="flex min-h-56 flex-col items-center justify-center text-center"><PackageSearch className="mb-3 size-9 text-muted-foreground" /><p className="font-medium">No matching orders</p><p className="mt-1 text-sm text-muted-foreground">Try an exact order ID, AWB, SKU, ASIN, product, or worker name.</p></CardContent></Card>;
  return <div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead>Order ID</TableHead><TableHead>Product</TableHead><TableHead>Marketplace</TableHead><TableHead>AWB</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{orders.map((order) => { const item = order.items[0]; return <TableRow key={order.id}><TableCell><Link href={`/admin/orders/${order.id}`} className="mono-data font-medium hover:text-primary">{order.marketplaceOrderId}</Link><p className="mono-data text-xs text-muted-foreground">{order.orderNumber}</p></TableCell><TableCell><p className="font-medium">{item?.title ?? "No product mapped"}</p>{item ? <p className="mono-data text-xs text-muted-foreground">{item.sku} · Qty {item.quantity}</p> : null}</TableCell><TableCell>{order.marketplace}</TableCell><TableCell className="mono-data text-sm">{order.awb ?? "—"}</TableCell><TableCell><Badge variant={order.state === "packed" ? "default" : order.state === "cancelled" ? "destructive" : "secondary"}>{order.state}</Badge></TableCell><TableCell><Link href={`/admin/orders/${order.id}`} aria-label={`Open ${order.marketplaceOrderId}`}><ArrowRight className="size-4" /></Link></TableCell></TableRow>; })}</TableBody></Table></div>;
}

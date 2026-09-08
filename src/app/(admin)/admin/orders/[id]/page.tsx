import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, PackageOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ProductArtwork } from "@/components/pack/product-artwork";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getOrderDetail } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Order detail" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrderDetail(id);
  if (!order) notFound();
  const item = order.items[0];
  return <main><PageHeader title={`Order ${order.marketplaceOrderId}`} description={`${order.marketplace} · ${order.orderNumber}`} action={<Button asChild variant="outline"><Link href="/admin/orders"><ArrowLeft />Back to orders</Link></Button>} />
    <div className="grid gap-6 xl:grid-cols-[minmax(300px,0.65fr)_minmax(420px,1.35fr)]">
      {item ? <ProductArtwork src={item.imageUrl} title={item.title} sku={item.sku} /> : <Card><CardContent className="flex aspect-[4/5] items-center justify-center"><PackageOpen className="size-12 text-muted-foreground" /></CardContent></Card>}
      <div className="space-y-6"><Card><CardHeader className="flex-row items-start justify-between"><div><p className="text-sm font-semibold uppercase tracking-widest text-primary">Product</p><CardTitle className="mt-2 text-2xl">{item?.title ?? "Unmapped product"}</CardTitle></div><Badge variant={order.state === "packed" ? "default" : "secondary"}>{order.state.toUpperCase()}</Badge></CardHeader><CardContent><dl className="grid gap-5 sm:grid-cols-2"><Detail label="SKU" value={item?.sku ?? "—"} mono /><Detail label="Quantity" value={String(item?.quantity ?? 0)} /><Detail label="Variation" value={item?.variation ?? "—"} /><Detail label="ASIN" value={item?.asin ?? "—"} mono /><Detail label="Location" value={item?.location ?? "Not assigned"} /><Detail label="Product ID" value={item?.productId ?? "—"} mono /></dl></CardContent></Card>
        <Card><CardHeader><CardTitle>Order and packing</CardTitle></CardHeader><CardContent><dl className="grid gap-5 sm:grid-cols-2"><Detail label="Marketplace order ID" value={order.marketplaceOrderId} mono /><Detail label="AWB" value={order.awb ?? "Not assigned"} mono /><Detail label="Marketplace" value={order.marketplace} /><Detail label="Reyo Pack ID" value={order.orderNumber} mono /></dl>{order.packing ? <><Separator className="my-6" /><div className="flex gap-3 rounded-xl bg-primary/10 p-4"><CheckCircle2 className="mt-0.5 size-5 text-primary" /><div><p className="font-semibold">Packed by {order.packing.workerDisplayName}</p><p className="mt-1 text-sm text-muted-foreground">{formatDateTime(order.packing.packedAt)}</p></div></div></> : null}</CardContent></Card></div>
    </div></main>;
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt><dd className={`mt-1.5 font-medium ${mono ? "mono-data text-sm" : ""}`}>{value}</dd></div>; }

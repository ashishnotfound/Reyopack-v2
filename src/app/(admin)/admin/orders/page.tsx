import type { Metadata } from "next";
import { Search } from "lucide-react";
import { OrderTable } from "@/components/admin/order-table";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listOrders } from "@/lib/data";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const orders = await listOrders(q);
  return <main><PageHeader title="Orders" description="Search current operational orders retained within the seven-day window." /><form className="mb-5 flex max-w-2xl gap-2"><Input name="q" defaultValue={q} placeholder="Order ID, AWB, SKU, product, ASIN, or worker" className="h-10" /><Button type="submit"><Search />Search</Button></form><OrderTable orders={orders} /></main>;
}

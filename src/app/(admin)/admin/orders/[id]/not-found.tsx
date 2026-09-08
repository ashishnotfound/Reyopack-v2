import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OrderNotFound() {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center text-center"><PackageSearch className="mb-4 size-12 text-muted-foreground" /><h1 className="text-2xl font-bold">Order not found</h1><p className="mt-2 text-muted-foreground">It may have expired under the seven-day retention policy.</p><Button asChild className="mt-5"><Link href="/admin/orders">Search orders</Link></Button></div>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { redirect } from "next/navigation";
import { OrderTable } from "@/components/admin/order-table";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listOrdersPage } from "@/lib/data";

export const metadata: Metadata = { title: "Orders" };

const filters = ["all", "today", "left", "packed", "waiting", "active", "overdue", "missing"] as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; filter?: string }> }) {
  const values = await searchParams;
  const q = values.q ?? "";
  const page = Math.max(1, Number.parseInt(values.page ?? "1", 10) || 1);
  const filter = filters.includes(values.filter as (typeof filters)[number]) ? values.filter! : "all";
  const result = await listOrdersPage(q, page, filter);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const href = (nextPage: number) => `/admin/orders?${new URLSearchParams({ ...(q ? { q } : {}), ...(filter !== "all" ? { filter } : {}), page: String(nextPage) })}`;
  if (page > pages) redirect(href(pages));
  return <main><PageHeader title="Orders" description={`${result.total.toLocaleString()} matching orders · 50 per page`} /><form className="mb-5 flex max-w-2xl gap-2"><input type="hidden" name="filter" value={filter} /><Input name="q" defaultValue={q} placeholder="Order ID, AWB, SKU, product, ASIN, or worker" className="h-10" /><Button type="submit"><Search />Search</Button></form><OrderTable orders={result.orders} /><div className="mt-4 flex items-center justify-between">{page <= 1 ? <Button variant="outline" disabled>Previous</Button> : <Button asChild variant="outline"><Link href={href(page - 1)}>Previous</Link></Button>}<span className="text-sm text-muted-foreground">Page {page} of {pages}</span>{page >= pages ? <Button variant="outline" disabled>Next</Button> : <Button asChild variant="outline"><Link href={href(page + 1)}>Next</Link></Button>}</div></main>;
}

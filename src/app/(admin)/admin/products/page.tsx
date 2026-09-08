import type { Metadata } from "next";
import { Boxes, Plus } from "lucide-react";
import { createProductAction } from "@/app/(admin)/admin/actions";
import { PageHeader } from "@/components/admin/page-header";
import { ProductImageUpload } from "@/components/admin/product-image-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isDemoMode } from "@/lib/config";
import { listLocations, listProducts } from "@/lib/data";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage() {
  const [products, locations] = await Promise.all([listProducts(), listLocations()]);
  const demo = isDemoMode();
  return <main><PageHeader title="Products" description="Reyo Pack products, marketplace identifiers, barcodes, and pick locations." /><div className="grid gap-6 xl:grid-cols-[1.5fr_0.7fr]">
    <div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>ASIN</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{products.map((product) => <TableRow key={product.id}><TableCell className="font-medium">{product.title}</TableCell><TableCell className="mono-data">{product.sku}</TableCell><TableCell className="mono-data text-muted-foreground">{product.asin ?? "—"}</TableCell><TableCell className="mono-data">{product.location ?? "—"}</TableCell><TableCell><Badge variant={product.active ? "default" : "secondary"}>{product.active ? "Active" : "Archived"}</Badge></TableCell></TableRow>)}</TableBody></Table>{!products.length ? <div className="flex min-h-48 flex-col items-center justify-center text-muted-foreground"><Boxes className="mb-2 size-8" /><p>No products yet</p></div> : null}</div>
    <div className="space-y-6"><Card><CardHeader><CardTitle>Add product</CardTitle><CardDescription>{demo ? "Changes are disabled in the development adapter." : "Create a master product and optional scan barcode."}</CardDescription></CardHeader><CardContent><form action={createProductAction} className="space-y-4"><Field label="Product title" name="title" placeholder="Frieren A4 Art Print" disabled={demo} /><Field label="SKU" name="sku" placeholder="FRIEREN-A4-01" mono disabled={demo} /><Field label="ASIN (optional)" name="asin" placeholder="B0…" mono disabled={demo} /><Field label="Barcode (optional)" name="barcode" placeholder="890…" mono disabled={demo} /><div className="space-y-2"><Label htmlFor="locationId">Pick location</Label><Select name="locationId" disabled={demo}><SelectTrigger id="locationId" className="w-full"><SelectValue placeholder="Not assigned" /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.code}</SelectItem>)}</SelectContent></Select></div><Button className="w-full" type="submit" disabled={demo}><Plus />Add product</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Upload artwork</CardTitle><CardDescription>Private Supabase Storage image, transformed for fast packing-terminal display.</CardDescription></CardHeader><CardContent><ProductImageUpload products={products} disabled={demo} /></CardContent></Card></div>
  </div></main>;
}

function Field({ label, name, placeholder, mono, disabled }: { label: string; name: string; placeholder: string; mono?: boolean; disabled?: boolean }) { return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} placeholder={placeholder} className={mono ? "mono-data" : ""} disabled={disabled} required={name === "title" || name === "sku"} /></div>; }

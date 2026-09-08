import type { Metadata } from "next";
import { MapPinned, Plus } from "lucide-react";
import { createLocationAction } from "@/app/(admin)/admin/actions";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isDemoMode } from "@/lib/config";
import { listLocations, listWarehouses } from "@/lib/data";

export const metadata: Metadata = { title: "Locations" };

export default async function LocationsPage() {
  const [locations, warehouses] = await Promise.all([listLocations(), listWarehouses()]); const demo = isDemoMode();
  return <main><PageHeader title="Locations" description="Warehouse rack, shelf, and bin labels shown immediately after each scan." /><div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]"><section className="grid gap-3 sm:grid-cols-2">{locations.map((location) => <Card key={location.id}><CardContent className="p-5"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-lg bg-muted"><MapPinned className="size-5 text-primary" /></span><Badge variant={location.active ? "default" : "secondary"}>{location.active ? "Active" : "Inactive"}</Badge></div><p className="mono-data mt-5 text-2xl font-bold">{location.code}</p><p className="mt-1 text-sm text-muted-foreground">{location.warehouseName}</p><div className="mt-4 flex gap-2 text-xs text-muted-foreground"><span>Rack {location.rack ?? "—"}</span><span>·</span><span>Shelf {location.shelf ?? "—"}</span><span>·</span><span>Bin {location.bin ?? "—"}</span></div></CardContent></Card>)}</section><Card><CardHeader><CardTitle>Add location</CardTitle><CardDescription>{demo ? "Changes are disabled in the development adapter." : "Use a short unique code workers can read quickly."}</CardDescription></CardHeader><CardContent><form action={createLocationAction} className="space-y-4"><div className="space-y-2"><Label htmlFor="warehouseId">Warehouse</Label><Select name="warehouseId" disabled={demo} required><SelectTrigger id="warehouseId" className="w-full"><SelectValue placeholder="Select warehouse" /></SelectTrigger><SelectContent>{warehouses.map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>)}</SelectContent></Select></div>{["code", "rack", "shelf", "bin"].map((name) => <div className="space-y-2" key={name}><Label className="capitalize" htmlFor={name}>{name}</Label><Input id={name} name={name} className="mono-data" disabled={demo} required={name === "code"} /></div>)}<Button className="w-full" disabled={demo}><Plus />Add location</Button></form></CardContent></Card></div></main>;
}

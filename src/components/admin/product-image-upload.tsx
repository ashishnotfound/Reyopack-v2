"use client";

import { useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductSummary } from "@/types/domain";

export function ProductImageUpload({ products, disabled }: { products: ProductSummary[]; disabled: boolean }) {
  const [productId, setProductId] = useState(products[0]?.id ?? ""); const [pending, setPending] = useState(false);
  async function upload(formData: FormData) {
    if (!productId) return;
    setPending(true);
    try {
      const response = await fetch(`/api/admin/products/${productId}/image`, { method: "POST", body: formData });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Upload failed.");
      toast.success("Product artwork uploaded");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Upload failed."); }
    finally { setPending(false); }
  }
  return <form action={(data) => void upload(data)} className="space-y-4"><div className="space-y-2"><Label>Product</Label><Select value={productId} onValueChange={setProductId} disabled={disabled}><SelectTrigger className="w-full"><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{products.map((product) => <SelectItem value={product.id} key={product.id}>{product.title}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="file">Artwork file</Label><Input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required disabled={disabled} /></div><div className="space-y-2"><Label htmlFor="altText">Alt text</Label><Input id="altText" name="altText" placeholder="Product artwork" disabled={disabled} /></div><Button className="w-full" disabled={disabled || pending || !productId}>{pending ? <Loader2 className="animate-spin" /> : <ImagePlus />}Upload artwork</Button></form>;
}

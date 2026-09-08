import Image from "next/image";
import { PackageOpen } from "lucide-react";

export function ProductArtwork({ src, title, sku }: { src?: string | null; title: string; sku: string }) {
  if (src) {
    return (
      <div className="relative aspect-[4/5] min-h-0 overflow-hidden rounded-xl bg-muted">
        <Image src={src} alt={title} fill priority unoptimized={src.startsWith("/api/artwork")} sizes="(max-width: 768px) 100vw, 42vw" className="object-contain" />
      </div>
    );
  }

  return (
    <div className="relative flex aspect-[4/5] min-h-0 flex-col justify-between overflow-hidden rounded-xl border bg-[linear-gradient(145deg,color-mix(in_oklch,var(--primary)_22%,var(--card)),var(--card)_60%)] p-7">
      <div className="absolute inset-0 opacity-40 scanner-grid" />
      <div className="relative flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <PackageOpen className="size-5 text-primary" />
        Reyo Store
      </div>
      <div className="relative">
        <div className="mb-5 h-1 w-16 rounded-full bg-primary" />
        <p className="max-w-sm text-4xl font-black leading-[0.92] tracking-[-0.06em] text-foreground sm:text-5xl">{title}</p>
      </div>
      <p className="relative mono-data text-sm font-medium text-muted-foreground">{sku}</p>
    </div>
  );
}

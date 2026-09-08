import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLogo({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_55%,transparent)]">
        <PackageCheck className="size-5" aria-hidden="true" />
      </span>
      <span className={cn("text-lg", compact && "sr-only")}>Reyo Pack</span>
    </Link>
  );
}

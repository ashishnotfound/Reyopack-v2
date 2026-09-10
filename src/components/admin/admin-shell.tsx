"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Boxes,
  ChevronRight,
  ClipboardList,
  Gauge,
  HeartPulse,
  History,
  LayoutDashboard,
  LogOut,
  MapPinned,
  PackageSearch,
  RefreshCw,
  Settings,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import { AppLogo } from "@/components/app-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import type { Viewer } from "@/types/domain";

const navigation = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/pickup", label: "Order Overview / Pickup", icon: ClipboardList },
  { href: "/admin/activity", label: "Packing Activity", icon: Activity },
  { href: "/admin/orders", label: "Orders", icon: PackageSearch },
  { href: "/admin/orders/import", label: "CSV Import", icon: Upload },
  { href: "/admin/products", label: "Products", icon: Boxes },
  { href: "/admin/workers", label: "Workers", icon: Users },
  { href: "/admin/locations", label: "Locations", icon: MapPinned },
  { href: "/admin/integrations", label: "Integrations", icon: ShieldCheck },
  { href: "/admin/sync", label: "Marketplace Sync", icon: RefreshCw },
  { href: "/admin/reports", label: "Reports", icon: ClipboardList },
  { href: "/admin/retention", label: "Data Retention", icon: History },
  { href: "/admin/system-health", label: "System Health", icon: HeartPulse },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="hidden min-h-screen flex-col border-r bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="flex h-16 items-center px-5"><AppLogo href="/admin" /></div>
        <Separator className="bg-sidebar-border" />
        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Admin navigation">
          {navigation.map((item) => <NavItem key={item.href} item={item} pathname={pathname} />)}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <Button asChild variant="ghost" className="mb-2 w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><Link href="/pack"><Gauge />Packing terminal<ChevronRight className="ml-auto" /></Link></Button>
          <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent p-3">
            <Avatar className="size-8"><AvatarFallback>{initials(viewer.displayName)}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{viewer.displayName}</p><p className="truncate text-xs text-sidebar-foreground/65">{viewer.email}</p></div>
            <form action={logoutAction}><Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out"><LogOut /></Button></form>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/92 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <Sheet><SheetTrigger asChild><Button variant="outline" size="icon" aria-label="Open navigation"><Boxes /></Button></SheetTrigger><SheetContent side="left" className="w-[285px] bg-sidebar p-0 text-sidebar-foreground"><SheetHeader className="border-b border-sidebar-border p-5"><SheetTitle className="text-left text-sidebar-foreground"><AppLogo href="/admin" /></SheetTitle></SheetHeader><nav className="space-y-1 p-3">{navigation.map((item) => <NavItem key={item.href} item={item} pathname={pathname} />)}</nav></SheetContent></Sheet>
            <span className="font-semibold">Admin</span>
          </div>
          <div className="hidden items-center gap-2 lg:flex"><span className="size-2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" /><span className="text-sm font-medium">Operations live</span></div>
          <div className="flex items-center gap-2"><Badge variant="secondary" className="capitalize">{viewer.role.replace("_", " ")}</Badge><ThemeToggle /></div>
        </header>
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}

function NavItem({ item, pathname }: { item: (typeof navigation)[number]; pathname: string }) {
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const Icon = item.icon;
  return <Link href={item.href} className={cn("flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/72 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground")}><Icon className="size-4" />{item.label}</Link>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, Keyboard, MoonStar } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { TerminalPreferences } from "@/components/admin/terminal-preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <main><PageHeader title="Settings" description="Terminal preferences and links to protected operational configuration." /><div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Keyboard className="text-primary" />Packing terminal</CardTitle><CardDescription>Preferences are applied without interrupting scanner focus.</CardDescription></CardHeader><CardContent><TerminalPreferences /></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><MoonStar className="text-primary" />Appearance</CardTitle><CardDescription>Light and dark mode follow each user’s stored browser preference.</CardDescription></CardHeader><CardContent className="text-sm text-muted-foreground">Use the sun or moon control in the top bar. Contrast, status colors, and scanner states adapt automatically.</CardContent></Card><Card className="lg:col-span-2"><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-lg bg-muted"><Database className="text-primary" /></span><div className="flex-1"><p className="font-semibold">Data retention and cleanup</p><p className="text-sm text-muted-foreground">Review the terminal-state retention window and last automated cleanup.</p></div><Button asChild variant="outline"><Link href="/admin/retention">Open<ArrowRight /></Link></Button></CardContent></Card></div></main>;
}

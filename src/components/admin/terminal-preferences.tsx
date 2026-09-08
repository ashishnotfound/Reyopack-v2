"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setSoundPreference, useSoundPreference } from "@/lib/sound-preference";

export function TerminalPreferences() {
  const sound = useSoundPreference();
  return <div className="flex items-center justify-between gap-4 rounded-lg border p-4"><div><Label htmlFor="successSound" className="text-base">Packing success sound</Label><p className="mt-1 text-sm text-muted-foreground">Stored on this terminal only.</p></div><Switch id="successSound" checked={sound} onCheckedChange={setSoundPreference} /></div>;
}

import { FlaskConical } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-400 px-3 py-1.5 text-center text-xs font-semibold text-amber-950">
      <FlaskConical className="size-3.5" aria-hidden="true" />
      Development adapter — no production data is being changed
    </div>
  );
}

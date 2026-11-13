/** In-memory only. A lookup owns the gate until its finally, never until camera restart. */
export class ScanGate {
  busy = false;
  private lastCode = "";
  reason = "none";
  begin(code: string) {
    if (this.busy) { this.reason = "lookup in flight"; return false; }
    if (code === this.lastCode) { this.reason = "same label held"; return false; }
    this.busy = true; this.lastCode = code; this.reason = "lookup in flight";
    return true;
  }
  finish() { this.busy = false; this.reason = "none"; }
  retry() { if (!this.busy) { this.lastCode = ""; this.reason = "none"; } }
}

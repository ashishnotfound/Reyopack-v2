import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/config";
import { resetDemoOrder } from "@/lib/demo-runtime";

export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  resetDemoOrder();
  return NextResponse.json({ reset: true });
}

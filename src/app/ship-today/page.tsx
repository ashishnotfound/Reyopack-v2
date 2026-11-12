import { requireViewer } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { ShipToday } from "@/components/pack/ship-today";
export const metadata = { title: "Ship Today" };
export default async function ShipTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  await requireViewer();
  const { batch } = await searchParams;
  const validBatch =
    batch &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      batch,
    )
      ? batch
      : null;
  return (
    <ShipToday
      key={validBatch ?? "today"}
      initialBatch={validBatch}
      realtime={!isDemoMode()}
    />
  );
}

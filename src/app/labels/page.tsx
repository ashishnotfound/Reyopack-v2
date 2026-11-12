import { requireViewer } from "@/lib/auth";
import { LabelPrinter } from "@/components/pack/label-printer";
export const metadata = { title: "Shipping labels" };
export default async function LabelsPage() {
  await requireViewer();
  return <LabelPrinter />;
}

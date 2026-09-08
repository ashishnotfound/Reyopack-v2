import type { Metadata } from "next";
import { CsvImporter } from "@/components/admin/csv-importer";
import { PageHeader } from "@/components/admin/page-header";
import { isDemoMode } from "@/lib/config";

export const metadata: Metadata = { title: "CSV Import" };

export default function CsvImportPage() {
  return <main><PageHeader title="Import orders" description="Validate, preview, and confirm marketplace order files. Invalid rows are never imported silently." /><CsvImporter disabled={isDemoMode()} /></main>;
}

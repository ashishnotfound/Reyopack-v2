"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { loadAmazonCredentials, saveAmazonCredentials } from "@/lib/marketplaces/amazon-credentials";
import { verifyAmazonOrdersAccess } from "@/lib/marketplaces/amazon";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { amazonCredentialInputSchema, appRoleSchema, locationSchema, productSchema, workerIdSchema, workerSchema } from "@/lib/validators";

export type AmazonCredentialActionState = { error?: string; success?: string };

export async function updateAmazonCredentialsAction(
  _: AmazonCredentialActionState,
  formData: FormData,
): Promise<AmazonCredentialActionState> {
  await requireRole(["super_admin"]);
  if (isDemoMode()) return { error: "Credential changes are disabled in demo mode." };

  const parsed = amazonCredentialInputSchema.safeParse({
    clientId: formData.get("clientId"),
    clientSecret: formData.get("clientSecret"),
    refreshToken: formData.get("refreshToken"),
    endpoint: formData.get("endpoint"),
    marketplaceIds: formData.get("marketplaceIds"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the Amazon credential fields." };

  try {
    const existing = await loadAmazonCredentials();
    const credentials = {
      clientId: parsed.data.clientId || existing?.clientId || "",
      clientSecret: parsed.data.clientSecret || existing?.clientSecret || "",
      refreshToken: parsed.data.refreshToken || existing?.refreshToken || "",
      endpoint: parsed.data.endpoint,
      marketplaceIds: parsed.data.marketplaceIds,
    };
    if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      return { error: "Client ID, client secret, and refresh token are required for the first setup." };
    }

    await verifyAmazonOrdersAccess(credentials);
    await saveAmazonCredentials(credentials);
    revalidatePath("/admin/integrations");
    revalidatePath("/admin/sync");
    return { success: "Amazon credentials verified and saved. Future syncs will use them immediately." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Amazon credentials could not be updated." };
  }
}

export async function createProductAction(formData: FormData) {
  await requireRole(["admin", "super_admin"]);
  if (isDemoMode()) return;
  const parsed = productSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { data: product, error } = await supabase.from("products").insert({
    sku: parsed.sku,
    title: parsed.title,
    asin: parsed.asin || null,
    location_id: parsed.locationId || null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  if (parsed.barcode) {
    const { error: barcodeError } = await supabase.from("product_barcodes").insert({ product_id: product.id, barcode: parsed.barcode });
    if (barcodeError) throw new Error(barcodeError.message);
  }
  revalidatePath("/admin/products");
}

export async function createLocationAction(formData: FormData) {
  await requireRole(["admin", "super_admin"]);
  if (isDemoMode()) return;
  const parsed = locationSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("locations").insert({
    warehouse_id: parsed.warehouseId,
    code: parsed.code,
    rack: parsed.rack || null,
    shelf: parsed.shelf || null,
    bin: parsed.bin || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/locations");
}

export async function createWorkerAction(formData: FormData) {
  const viewer = await requireRole(["admin", "super_admin"]);
  if (isDemoMode()) return;
  const parsed = workerSchema.parse(Object.fromEntries(formData));
  if (parsed.role === "super_admin" && viewer.role !== "super_admin") throw new Error("Only a super admin can create another super admin.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.email,
    password: parsed.password,
    email_confirm: true,
    user_metadata: { display_name: parsed.displayName },
    app_metadata: { role: parsed.role },
  });
  if (error || !data.user) throw new Error(error?.message ?? "Worker account was not created.");

  const { error: profileError } = await admin.from("profiles").update({ display_name: parsed.displayName, email: parsed.email, active: true }).eq("id", data.user.id);
  const { error: roleError } = await admin.from("user_roles").upsert({ user_id: data.user.id, role: parsed.role });
  if (profileError || roleError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(profileError?.message ?? roleError?.message ?? "Worker profile was not created.");
  }
  revalidatePath("/admin/workers");
}

export async function setWorkerActiveAction(workerId: string, active: boolean) {
  const viewer = await requireRole(["admin", "super_admin"]);
  if (isDemoMode()) return;
  const parsedWorkerId = workerIdSchema.parse(workerId);
  if (viewer.id === parsedWorkerId && !active) throw new Error("You cannot disable your own active session.");
  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin.from("user_roles").select("role").eq("user_id", parsedWorkerId).single();
  if (targetError) throw new Error(targetError.message);
  if (target.role === "super_admin" && viewer.role !== "super_admin") throw new Error("Only a super admin can change another super admin.");
  const { error } = await admin.from("profiles").update({ active }).eq("id", parsedWorkerId);
  if (error) throw new Error(error.message);
  if (!active) {
    const { error: signOutError } = await admin.auth.admin.signOut(parsedWorkerId, "global");
    if (signOutError) throw new Error(signOutError.message);
  }
  revalidatePath("/admin/workers");
}

export async function setWorkerRoleAction(workerId: string, formData: FormData) {
  const viewer = await requireRole(["super_admin"]);
  if (isDemoMode()) return;
  const parsedWorkerId = workerIdSchema.parse(workerId);
  const parsedRole = appRoleSchema.parse(String(formData.get("role") ?? ""));
  if (viewer.id === parsedWorkerId && parsedRole !== "super_admin") throw new Error("You cannot remove your own super admin access.");
  const admin = createAdminClient();
  const { error } = await admin.from("user_roles").upsert({ user_id: parsedWorkerId, role: parsedRole });
  if (error) throw new Error(error.message);
  const { error: metadataError } = await admin.auth.admin.updateUserById(parsedWorkerId, { app_metadata: { role: parsedRole } });
  if (metadataError) throw new Error(metadataError.message);
  revalidatePath("/admin/workers");
}

export async function runRetentionAction() {
  await requireRole(["admin", "super_admin"]);
  if (isDemoMode()) return;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purge_expired_operational_data");
  if (error) throw new Error(error.message);
  if ((data as { status?: string; error?: string } | null)?.status === "failed") {
    throw new Error((data as { error?: string }).error ?? "Retention cleanup failed.");
  }
  revalidatePath("/admin/retention");
}

export async function updateRetentionAction(formData: FormData) {
  await requireRole(["super_admin"]);
  if (isDemoMode()) return;
  const value = Number(formData.get("retentionDays"));
  if (!Number.isInteger(value) || value < 7 || value > 90) throw new Error("Retention must be between 7 and 90 days.");
  const supabase = await createClient();
  const { error } = await supabase.from("system_settings").upsert({ key: "retention_days", value: String(value) });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/retention");
}

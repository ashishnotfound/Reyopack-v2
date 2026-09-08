import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const [email, password, displayName = "Reyo"] = process.argv.slice(2);

if (!url || !secret || !email || !password) {
  console.error("Usage: npm run admin:create -- email@example.com strong-password \"Display Name\"");
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
  process.exit(1);
}

if (password.length < 12) {
  console.error("Password must contain at least 12 characters.");
  process.exit(1);
}

const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: displayName },
  app_metadata: { role: "super_admin" },
});

if (error || !data.user) {
  console.error(error?.message ?? "Admin creation failed.");
  process.exit(1);
}

const { error: profileError } = await supabase.from("profiles").update({ display_name: displayName, active: true }).eq("id", data.user.id);
const { error: roleError } = await supabase.from("user_roles").upsert({ user_id: data.user.id, role: "super_admin" });
if (profileError || roleError) {
  await supabase.auth.admin.deleteUser(data.user.id);
  console.error(profileError?.message ?? roleError?.message ?? "Admin profile setup failed.");
  process.exit(1);
}

console.log(`Super admin created for ${email}.`);

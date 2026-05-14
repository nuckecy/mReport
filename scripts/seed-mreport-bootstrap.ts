/**
 * seed-mreport-bootstrap.ts — bootstrap mReport for an existing platform tenant.
 *
 * Run with: pnpm tsx scripts/seed-mreport-bootstrap.ts
 *
 * What it does (idempotent):
 *   1. Verifies 'mreport' is registered in core_apps (run 0003_mreport_seed_app.sql first).
 *   2. Picks a target tenant (env: SEED_TENANT_SLUG, default first available).
 *   3. Enables mReport for that tenant (core_tenant_apps).
 *   4. Creates the bootstrap super-admin user via Supabase Auth (env:
 *      SEED_SUPER_ADMIN_EMAIL), inserts matching core_users row, adds
 *      tenant membership (core_tenant_users) and mReport super_admin role
 *      (core_tenant_user_roles).
 *   5. Seeds 1 region + 3 parishes in mReport's namespace for that tenant.
 *
 * Re-running this script is safe — it skips anything that already exists.
 *
 * Requires environment variables (read from .env.local):
 *   SUPABASE_URL                  https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY     server-only key (bypasses RLS)
 *   SEED_SUPER_ADMIN_EMAIL        bootstrap super-admin's email
 *   SEED_TENANT_SLUG (optional)   target tenant; defaults to first found
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

// Load .env.local (this script is run outside Next.js, so we have to do it manually)
config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL;
const TARGET_TENANT_SLUG = process.env.SEED_TENANT_SLUG; // optional

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env.local");
  process.exit(1);
}
if (!SUPER_ADMIN_EMAIL) {
  console.error("✗ SEED_SUPER_ADMIN_EMAIL required in .env.local");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log("\n=== mReport bootstrap seed ===\n");

  // ── 1. Verify mreport is registered in core_apps ──────────────────────────
  const { data: app, error: appErr } = await admin
    .from("core_apps")
    .select("id, slug, name")
    .eq("slug", "mreport")
    .maybeSingle();
  if (appErr) throw appErr;
  if (!app) {
    console.error(
      "✗ 'mreport' not found in core_apps. Run migration 0003_mreport_seed_app.sql first.",
    );
    process.exit(1);
  }
  console.log(`✓ Found app: ${app.name} (${app.slug}, id=${app.id})`);

  // ── 2. Pick a target tenant ───────────────────────────────────────────────
  let tenantQuery = admin.from("core_tenants").select("id, slug, name").eq("status", "active");
  if (TARGET_TENANT_SLUG) {
    tenantQuery = tenantQuery.eq("slug", TARGET_TENANT_SLUG);
  }
  const { data: tenants, error: tenantErr } = await tenantQuery.limit(1);
  if (tenantErr) throw tenantErr;
  if (!tenants || tenants.length === 0) {
    console.error(
      `✗ No active tenant found${TARGET_TENANT_SLUG ? ` matching slug '${TARGET_TENANT_SLUG}'` : ""}.`,
    );
    console.error("  Create a tenant in core_tenants first (likely via the platform admin tool).");
    process.exit(1);
  }
  const tenant = tenants[0]!;
  console.log(`✓ Target tenant: ${tenant.name} (${tenant.slug}, id=${tenant.id})`);

  // ── 3. Enable mReport for that tenant ─────────────────────────────────────
  const { error: enableErr } = await admin
    .from("core_tenant_apps")
    .upsert(
      { tenant_id: tenant.id, app_id: app.id, enabled: true },
      { onConflict: "tenant_id,app_id" },
    );
  if (enableErr) throw enableErr;
  console.log(`✓ Enabled mReport for tenant '${tenant.slug}'`);

  // ── 4. Bootstrap super-admin user ─────────────────────────────────────────
  // 4a. Create or find the auth.users row.
  const { data: authUserList, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  let authUserId = authUserList.users.find((u) => u.email === SUPER_ADMIN_EMAIL)?.id;
  if (!authUserId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: SUPER_ADMIN_EMAIL!,
      email_confirm: true,
    });
    if (createErr) throw createErr;
    authUserId = created.user.id;
    console.log(`✓ Created Supabase auth.users row for ${SUPER_ADMIN_EMAIL}`);
  } else {
    console.log(`✓ Found existing auth.users row for ${SUPER_ADMIN_EMAIL}`);
  }

  // 4b. Upsert core_users with id = authUserId.
  const { error: coreUserErr } = await admin.from("core_users").upsert(
    {
      id: authUserId,
      email: SUPER_ADMIN_EMAIL!,
      name: SUPER_ADMIN_EMAIL!.split("@")[0]!, // "nuckecy" — easy to update later
      email_verified: true,
      is_platform_admin: true, // bootstrap super-admin gets platform-admin bypass too
    },
    { onConflict: "id" },
  );
  if (coreUserErr) throw coreUserErr;
  console.log(`✓ Upserted core_users (is_platform_admin=true)`);

  // 4c. Tenant membership.
  const { error: memErr } = await admin
    .from("core_tenant_users")
    .upsert(
      { tenant_id: tenant.id, user_id: authUserId, status: "active" },
      { onConflict: "tenant_id,user_id" },
    );
  if (memErr) throw memErr;
  console.log(`✓ Added tenant membership`);

  // 4d. mReport super_admin role.
  // Check if a role row already exists; insert only if not.
  const { data: existingRoles, error: roleSelErr } = await admin
    .from("core_tenant_user_roles")
    .select("id, role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", authUserId)
    .eq("app_id", app.id);
  if (roleSelErr) throw roleSelErr;

  if (!existingRoles || existingRoles.length === 0) {
    const { error: roleErr } = await admin.from("core_tenant_user_roles").insert({
      tenant_id: tenant.id,
      user_id: authUserId,
      app_id: app.id,
      role: "super_admin",
      assigned_by: authUserId, // bootstrap; will be set to actual assigner later
    });
    if (roleErr) throw roleErr;
    console.log(`✓ Assigned mReport super_admin role`);
  } else {
    console.log(`✓ Role already exists: ${existingRoles[0]!.role}`);
  }

  // ── 5. Seed mreport_tenant_settings + region + parishes ───────────────────
  const { error: settingsErr } = await admin
    .from("mreport_tenant_settings")
    .upsert({ tenant_id: tenant.id }, { onConflict: "tenant_id" });
  if (settingsErr) throw settingsErr;
  console.log(`✓ Created mreport_tenant_settings row`);

  // Region — use a tenant-friendly default name.
  const regionName = "Region 4";
  const { data: region, error: regionErr } = await admin
    .from("mreport_regions")
    .upsert({ tenant_id: tenant.id, name: regionName }, { onConflict: "tenant_id,name" })
    .select("id, name")
    .single();
  if (regionErr) throw regionErr;
  console.log(`✓ Region '${region!.name}' (id=${region!.id})`);

  // Three parishes — based on the prototype's real-world test data.
  const parishes = [
    {
      name: "Mount Zion Parish Berlin",
      pastor_name: "Pastor Helen Hennecke",
      email: "rccgberlin@aol.com",
      mobile: "+49 17672475585",
    },
    {
      name: "New Song Parish Berlin",
      pastor_name: "Pastor Charity Sindio",
      email: "pastorsindio@gmail.com",
      mobile: "+49 17611849370",
    },
    {
      name: "RCCG Fountain of Life Parish Neumünster",
      pastor_name: "Pastor Eric Nnaji",
      email: "najeeven@hotmail.com",
      mobile: "+49 17676896212",
    },
  ];
  for (const p of parishes) {
    const { error: parishErr } = await admin.from("mreport_parishes").upsert(
      {
        tenant_id: tenant.id,
        region_id: region!.id,
        name: p.name,
        pastor_name: p.pastor_name,
        email: p.email,
        mobile: p.mobile,
      },
      { onConflict: "tenant_id,name" },
    );
    if (parishErr) throw parishErr;
    console.log(`✓ Parish '${p.name}'`);
  }

  console.log("\n=== Bootstrap complete ===\n");
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`Super-admin: ${SUPER_ADMIN_EMAIL} (id=${authUserId})`);
  console.log(`Region: ${region!.name} with 3 parishes seeded\n`);
  console.log("Next: try logging in via Supabase Auth (magic code) once the auth UI is wired.\n");
}

main().catch((err) => {
  console.error("\n✗ Bootstrap failed:", err);
  process.exit(1);
});

// Platform `core_*` schema — MIRROR from event-calendar/db/schema/core.ts.
//
// READ-ONLY from mReport's perspective. Per docs/PLATFORM-INTEGRATION.md,
// these tables are platform-owned. mReport queries them but never owns
// the schema; changes to these tables happen via event-calendar (or
// future platform-admin tool) migrations.
//
// We mirror the definitions here (rather than import from event-calendar)
// so:
//   1. mReport is a self-contained app — it can be built/typechecked
//      without event-calendar being present.
//   2. If event-calendar evolves these tables, mReport's view of them
//      doesn't auto-update — we explicitly review and sync.
//
// SYNC STATUS: 2026-05-14 — verified identical to
// event-calendar/db/schema/core.ts at commit time.

import { pgTable, uuid, text, boolean, timestamp, primaryKey, pgEnum } from "drizzle-orm/pg-core";

// ── Enums ─────────────────────────────────────────────────────────────

export const appStatusEnum = pgEnum("app_status", ["active", "inactive", "beta"]);

export const tenantStatusEnum = pgEnum("tenant_status", ["active", "suspended", "trial"]);

export const domainVerificationStatusEnum = pgEnum("domain_verification_status", [
  "pending",
  "dns_verified",
  "active",
  "failed",
]);

export const memberStatusEnum = pgEnum("member_status", [
  "visitor",
  "regular",
  "member",
  "leader",
  "staff",
  "inactive",
]);

// ── core_tenants ──────────────────────────────────────────────────────

export const coreTenants = pgTable("core_tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo_url: text("logo_url"),
  timezone: text("timezone").default("Europe/Berlin"),
  status: tenantStatusEnum("status").default("active"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// ── core_users ────────────────────────────────────────────────────────
// IMPORTANT: core_users.id is the SAME UUID as auth.users.id. The
// platform forces this 1:1 mapping in its signup flow (and our own
// scripts/seed-mreport-bootstrap.ts).

export const coreUsers = pgTable("core_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatar_url: text("avatar_url"),
  password_hash: text("password_hash"),
  is_platform_admin: boolean("is_platform_admin").default(false),
  email_verified: boolean("email_verified").default(false),
  last_login_at: timestamp("last_login_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// ── core_apps ─────────────────────────────────────────────────────────

export const coreApps = pgTable("core_apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  status: appStatusEnum("status").default("active"),
  created_at: timestamp("created_at").defaultNow(),
});

// ── core_tenant_apps ──────────────────────────────────────────────────

export const coreTenantApps = pgTable(
  "core_tenant_apps",
  {
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => coreTenants.id, { onDelete: "cascade" }),
    app_id: uuid("app_id")
      .notNull()
      .references(() => coreApps.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(true),
    enabled_at: timestamp("enabled_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenant_id, table.app_id] }),
  }),
);

// ── core_tenant_users ─────────────────────────────────────────────────

export const coreTenantUsers = pgTable(
  "core_tenant_users",
  {
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => coreTenants.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    joined_at: timestamp("joined_at").defaultNow(),
    status: text("status").default("active"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenant_id, table.user_id] }),
  }),
);

// ── core_tenant_user_roles ────────────────────────────────────────────
// Role assignment scoped to tenant + app. mReport rows use `app_id =
// (the mreport app id)` and `role` is one of mReport's vocabulary
// (super_admin / regional_admin / parish_admin / preparer).

export const coreTenantUserRoles = pgTable("core_tenant_user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id")
    .notNull()
    .references(() => coreTenants.id, { onDelete: "cascade" }),
  user_id: uuid("user_id")
    .notNull()
    .references(() => coreUsers.id, { onDelete: "cascade" }),
  app_id: uuid("app_id")
    .notNull()
    .references(() => coreApps.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  assigned_at: timestamp("assigned_at").defaultNow(),
  assigned_by: uuid("assigned_by").references(() => coreUsers.id),
});

// ── core_tenant_domains ───────────────────────────────────────────────

export const coreTenantDomains = pgTable("core_tenant_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id")
    .notNull()
    .references(() => coreTenants.id, { onDelete: "cascade" }),
  domain: text("domain").notNull().unique(),
  verification_status: domainVerificationStatusEnum("verification_status").default("pending"),
  verification_token: text("verification_token"),
  verified: boolean("verified").default(false),
  ssl_provisioned: boolean("ssl_provisioned").default(false),
  is_primary: boolean("is_primary").default(false),
  created_at: timestamp("created_at").defaultNow(),
  verified_at: timestamp("verified_at"),
  ssl_provisioned_at: timestamp("ssl_provisioned_at"),
  added_by: uuid("added_by").references(() => coreUsers.id),
});

// ── core_tenant_member_profiles ───────────────────────────────────────

export const coreTenantMemberProfiles = pgTable(
  "core_tenant_member_profiles",
  {
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => coreTenants.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    phone: text("phone"),
    city: text("city"),
    joined_church_at: timestamp("joined_church_at"),
    membership_status: memberStatusEnum("membership_status").default("visitor"),
    communication_email_opt_in: boolean("communication_email_opt_in").default(false),
    communication_sms_opt_in: boolean("communication_sms_opt_in").default(false),
    notes: text("notes"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenant_id, table.user_id] }),
  }),
);

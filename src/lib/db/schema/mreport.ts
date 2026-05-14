// mReport's own tables (`mreport_*` prefix). Owned by this app.
//
// Matches the SQL in supabase/migrations/0001_mreport_init.sql.
// When that migration changes, this file must change too.

import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { coreTenants, coreUsers } from "./core";

// ── Enums ─────────────────────────────────────────────────────────────

/**
 * mReport role vocabulary. Stored as `text` in core_tenant_user_roles.role
 * (because that column is shared across apps and can't be a fixed enum),
 * but we expose this enum here for typed mReport code paths.
 *
 * See docs/ARCHITECTURE.md §13.
 */
export const mreportUserRoleEnum = pgEnum("mreport_user_role", [
  "super_admin",
  "regional_admin",
  "parish_admin",
  "preparer",
]);
export type MreportUserRole = (typeof mreportUserRoleEnum.enumValues)[number];

export const mreportReportStatusEnum = pgEnum("mreport_report_status", [
  "submitted",
  "amended",
  "superseded",
]);

// ── mreport_regions ───────────────────────────────────────────────────

export const mreportRegions = pgTable(
  "mreport_regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => coreTenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index("mreport_regions_tenant_idx").on(table.tenant_id),
    tenantName: uniqueIndex().on(table.tenant_id, table.name),
  }),
);

// ── mreport_parishes ──────────────────────────────────────────────────

export const mreportParishes = pgTable(
  "mreport_parishes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => coreTenants.id, { onDelete: "cascade" }),
    region_id: uuid("region_id")
      .notNull()
      .references((): AnyPgColumn => mreportRegions.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    pastor_name: text("pastor_name"),
    email: text("email"),
    mobile: text("mobile"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index("mreport_parishes_tenant_idx").on(table.tenant_id),
    regionIdx: index("mreport_parishes_region_idx").on(table.region_id),
    tenantName: uniqueIndex().on(table.tenant_id, table.name),
  }),
);

// ── mreport_user_scopes ───────────────────────────────────────────────
// See docs/ARCHITECTURE.md §5 for the rationale: scope lives here, role
// vocabulary lives in core_tenant_user_roles.role.

export const mreportUserScopes = pgTable(
  "mreport_user_scopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => coreTenants.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "cascade" }),
    region_id: uuid("region_id").references((): AnyPgColumn => mreportRegions.id, {
      onDelete: "cascade",
    }),
    parish_id: uuid("parish_id").references((): AnyPgColumn => mreportParishes.id, {
      onDelete: "cascade",
    }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUserUnique: uniqueIndex().on(table.tenant_id, table.user_id),
    tenantUserIdx: index("mreport_user_scopes_tenant_user_idx").on(table.tenant_id, table.user_id),
    // CHECK: exactly one of region_id/parish_id must be set.
    oneScope: check(
      "mreport_user_scopes_one_scope",
      sql`(${table.region_id} IS NOT NULL AND ${table.parish_id} IS NULL) OR (${table.region_id} IS NULL AND ${table.parish_id} IS NOT NULL)`,
    ),
  }),
);

// ── mreport_reports ───────────────────────────────────────────────────

export const mreportReports = pgTable(
  "mreport_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => coreTenants.id, { onDelete: "restrict" }),
    parish_id: uuid("parish_id")
      .notNull()
      .references((): AnyPgColumn => mreportParishes.id, { onDelete: "restrict" }),
    report_month: date("report_month").notNull(),
    // Denormalized for query speed
    pastor_name: text("pastor_name"),
    attendance_avg: numeric("attendance_avg"),
    total_offering: numeric("total_offering"),
    total_tithe: numeric("total_tithe"),
    total_thanksgiving: numeric("total_thanksgiving"),
    total_others: numeric("total_others"),
    total_income: numeric("total_income"),
    // Audit
    submitted_by: uuid("submitted_by")
      .notNull()
      .references(() => coreUsers.id, { onDelete: "restrict" }),
    submitted_at: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    status: mreportReportStatusEnum("status").notNull().default("submitted"),
    amendment_note: text("amendment_note"),
    superseded_by: uuid("superseded_by").references((): AnyPgColumn => mreportReports.id, {
      onDelete: "set null",
    }),
    // Full payload + source
    raw_json: jsonb("raw_json").notNull(),
    source_file: text("source_file"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    parishMonthIdx: index("mreport_reports_parish_month_idx").on(
      table.parish_id,
      table.report_month,
    ),
    tenantMonthIdx: index("mreport_reports_tenant_month_idx").on(
      table.tenant_id,
      table.report_month,
    ),
    submittedByIdx: index("mreport_reports_submitted_by_idx").on(table.submitted_by),
    amendedNeedsNote: check(
      "mreport_reports_amended_needs_note",
      sql`${table.status} != 'amended' OR ${table.amendment_note} IS NOT NULL`,
    ),
  }),
);

// ── mreport_report_lines ──────────────────────────────────────────────

export const mreportReportLines = pgTable(
  "mreport_report_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    report_id: uuid("report_id")
      .notNull()
      .references(() => mreportReports.id, { onDelete: "cascade" }),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => coreTenants.id, { onDelete: "cascade" }),
    entry_date: date("entry_date").notNull(),
    day_label: text("day_label"),
    // Attendance
    men: integer("men").notNull().default(0),
    women: integer("women").notNull().default(0),
    children: integer("children").notNull().default(0),
    attendance_total: integer("attendance_total"),
    // Money
    offering: numeric("offering").notNull().default("0"),
    tithe: numeric("tithe").notNull().default("0"),
    thanksgiving: numeric("thanksgiving").notNull().default("0"),
    others: numeric("others").notNull().default("0"),
    money_total: numeric("money_total"),
    // Statistics (12 fields)
    births: integer("births").notNull().default(0),
    marriages: integer("marriages").notNull().default(0),
    deaths: integer("deaths").notNull().default(0),
    converts: integer("converts").notNull().default(0),
    baptisms: integer("baptisms").notNull().default(0),
    workers: integer("workers").notNull().default(0),
    ministers: integer("ministers").notNull().default(0),
    disciplinary: integer("disciplinary").notNull().default(0),
    new_parishes: integer("new_parishes").notNull().default(0),
    new_nations: integer("new_nations").notNull().default(0),
    church_dedication: integer("church_dedication").notNull().default(0),
    projects: integer("projects").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reportIdx: index("mreport_report_lines_report_idx").on(table.report_id, table.entry_date),
    tenantDateIdx: index("mreport_report_lines_tenant_date_idx").on(
      table.tenant_id,
      table.entry_date,
    ),
  }),
);

// ── mreport_audit_log ─────────────────────────────────────────────────

export const mreportAuditLog = pgTable(
  "mreport_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => coreTenants.id, { onDelete: "cascade" }),
    actor_id: uuid("actor_id").references(() => coreUsers.id, { onDelete: "set null" }),
    actor_email_masked: text("actor_email_masked"),
    action: text("action").notNull(),
    target_type: text("target_type"),
    target_id: uuid("target_id"),
    ip: text("ip"), // inet in DB, mapped as text in TS
    user_agent_summary: text("user_agent_summary"),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantTimeIdx: index("mreport_audit_log_tenant_time_idx").on(table.tenant_id, table.created_at),
    actorTimeIdx: index("mreport_audit_log_actor_time_idx").on(table.actor_id, table.created_at),
    actionTimeIdx: index("mreport_audit_log_action_time_idx").on(table.action, table.created_at),
  }),
);

// ── mreport_tenant_settings ───────────────────────────────────────────

export const mreportTenantSettings = pgTable("mreport_tenant_settings", {
  tenant_id: uuid("tenant_id")
    .primaryKey()
    .references(() => coreTenants.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

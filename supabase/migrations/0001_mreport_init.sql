-- ============================================================================
-- 0001_mreport_init.sql — initial schema for mReport
--
-- mReport is a parish-report extractor and validator. It coexists with the
-- platform's core_* tables and other apps (e.g. cem_*) inside the SAME
-- Supabase project (qvptudtzilpqbaffyfge, eu-central-1 Frankfurt).
--
-- WHAT THIS MIGRATION DOES:
--   1. Creates mReport-specific enums (severity, role)
--   2. Creates mreport_* tables: regions, parishes, user_scopes, reports,
--      report_lines, audit_log, tenant_settings
--   3. Adds indexes for hot query paths
--   4. Enables RLS on every table (policies in 0002_mreport_rls_policies.sql)
--
-- WHAT IT DOES NOT DO:
--   - It does NOT touch core_* tables. Those are platform-owned (defined in
--     event-calendar/db/schema/core.ts) and already exist in this DB.
--   - It does NOT register 'mreport' in core_apps. That happens in
--     0003_mreport_seed.sql (idempotent INSERT … ON CONFLICT).
--   - It does NOT create users or roles. That also happens in seed.
--
-- DESIGN NOTES (per docs/ARCHITECTURE.md):
--   - Table prefix is `mreport_` (matches platform convention `core_*`/`cem_*`).
--   - Every tenant-scoped table carries `tenant_id` and FK-references core_tenants.
--   - timestamptz (not timestamp) — see ARCHITECTURE.md §7.
--   - created_at/updated_at are NOT NULL DEFAULT now() — see ARCHITECTURE.md §7.
--   - metadata uses jsonb (not text) — see ARCHITECTURE.md §7.
--   - Region/parish scope lives in mreport_user_scopes, NOT in
--     core_tenant_user_roles.role — see ARCHITECTURE.md §5.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------

-- Member roles within mReport (per ARCHITECTURE.md §13). Stored as text in
-- core_tenant_user_roles.role; this enum is for our own typed columns.
CREATE TYPE mreport_user_role AS ENUM (
  'super_admin',
  'regional_admin',
  'parish_admin',
  'preparer'
);

-- Report submission lifecycle.
CREATE TYPE mreport_report_status AS ENUM (
  'submitted',     -- normal state
  'amended',       -- a newer version exists; this row is preserved for audit
  'superseded'     -- replaced by a newer submission for the same parish-month
);

-- ----------------------------------------------------------------------------
-- mreport_regions
-- Tenant-scoped region master. Some tenants have a regional layer above
-- parishes (e.g., RCCG Region 4); other tenants may have a single default
-- region per tenant. The parish.region_id is NOT NULL so every parish
-- always belongs to a region — for tenants without a real regional layer,
-- create a single "Default" region and assign all parishes to it.
-- ----------------------------------------------------------------------------
CREATE TABLE mreport_regions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (tenant_id, name)
);

CREATE INDEX mreport_regions_tenant_idx ON mreport_regions (tenant_id);

-- ----------------------------------------------------------------------------
-- mreport_parishes
-- Tenant-scoped parishes. Each parish belongs to exactly one region.
-- ----------------------------------------------------------------------------
CREATE TABLE mreport_parishes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  region_id   uuid NOT NULL REFERENCES mreport_regions(id) ON DELETE RESTRICT,
  name        text NOT NULL,
  pastor_name text,
  email       text,
  mobile      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (tenant_id, name)
);

CREATE INDEX mreport_parishes_tenant_idx ON mreport_parishes (tenant_id);
CREATE INDEX mreport_parishes_region_idx ON mreport_parishes (region_id);

-- ----------------------------------------------------------------------------
-- mreport_user_scopes
-- Per-user region/parish assignment within mReport. The role itself lives
-- in core_tenant_user_roles (where app_id = mreport's app_id); this table
-- holds the SCOPE that doesn't fit in the role-text vocabulary.
--
-- Composite uniqueness: one scope row per (user, tenant). A user can only
-- have ONE region/parish scope per tenant in mReport. If they need broader
-- access, they get super_admin (no scope row needed).
--
-- Constraint: regional_admin must have region_id set; parish_admin and
-- preparer must have parish_id set; super_admin should have no row at all.
-- (Enforced by application code + this CHECK constraint.)
-- ----------------------------------------------------------------------------
CREATE TABLE mreport_user_scopes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES core_users(id) ON DELETE CASCADE,
  region_id   uuid REFERENCES mreport_regions(id) ON DELETE CASCADE,
  parish_id   uuid REFERENCES mreport_parishes(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  -- Either region OR parish must be set, but not both. (super_admin doesn't
  -- need a scope row.)
  CONSTRAINT mreport_user_scopes_one_scope CHECK (
    (region_id IS NOT NULL AND parish_id IS NULL)
    OR (region_id IS NULL AND parish_id IS NOT NULL)
  )
);

CREATE INDEX mreport_user_scopes_tenant_user_idx ON mreport_user_scopes (tenant_id, user_id);
CREATE INDEX mreport_user_scopes_region_idx ON mreport_user_scopes (region_id) WHERE region_id IS NOT NULL;
CREATE INDEX mreport_user_scopes_parish_idx ON mreport_user_scopes (parish_id) WHERE parish_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- mreport_reports
-- One row per submitted parish-month report. The full parsed JSON lives in
-- raw_json for audit/replay; key fields are denormalized for fast filtering
-- and aggregation.
--
-- Amendment workflow: when a parish resubmits a month, the new report is
-- inserted with status='amended' and amendment_note populated. The old
-- report is updated with superseded_by = new_id (and status='superseded').
-- Both rows persist (per HGB §257 retention reading — 10-year bookkeeping).
-- ----------------------------------------------------------------------------
CREATE TABLE mreport_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES core_tenants(id) ON DELETE RESTRICT,
  parish_id          uuid NOT NULL REFERENCES mreport_parishes(id) ON DELETE RESTRICT,
  report_month       date NOT NULL,                      -- always first day of month
  -- Denormalized for query speed
  pastor_name        text,
  attendance_avg     numeric,
  total_offering     numeric,
  total_tithe        numeric,
  total_thanksgiving numeric,
  total_others       numeric,
  total_income       numeric,                            -- offering + tithe + tnx + others
  -- Audit
  submitted_by       uuid NOT NULL REFERENCES core_users(id) ON DELETE RESTRICT,
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  status             mreport_report_status NOT NULL DEFAULT 'submitted',
  amendment_note     text,
  superseded_by      uuid REFERENCES mreport_reports(id) ON DELETE SET NULL,
  -- Full payload + source
  raw_json           jsonb NOT NULL,
  source_file        text,                               -- Supabase Storage path
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mreport_reports_amended_needs_note
    CHECK (status != 'amended' OR amendment_note IS NOT NULL)
);

-- Hot path: "show me reports for parish X in date range".
CREATE INDEX mreport_reports_parish_month_idx
  ON mreport_reports (parish_id, report_month DESC);
-- Tenant-scoping query path.
CREATE INDEX mreport_reports_tenant_month_idx
  ON mreport_reports (tenant_id, report_month DESC);
CREATE INDEX mreport_reports_submitted_by_idx
  ON mreport_reports (submitted_by);
CREATE INDEX mreport_reports_superseded_by_idx
  ON mreport_reports (superseded_by) WHERE superseded_by IS NOT NULL;

-- ----------------------------------------------------------------------------
-- mreport_report_lines
-- Per-date breakdown of each report (one row per dated entry — Sunday or
-- midweek service). Lets us answer "show me Tithe trends for Mount Zion
-- across all 2025 Sundays" without scanning JSON blobs.
-- ----------------------------------------------------------------------------
CREATE TABLE mreport_report_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id           uuid NOT NULL REFERENCES mreport_reports(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  entry_date          date NOT NULL,
  day_label           text,
  -- Attendance
  men                 integer NOT NULL DEFAULT 0,
  women               integer NOT NULL DEFAULT 0,
  children            integer NOT NULL DEFAULT 0,
  attendance_total    integer,
  -- Money
  offering            numeric NOT NULL DEFAULT 0,
  tithe               numeric NOT NULL DEFAULT 0,
  thanksgiving        numeric NOT NULL DEFAULT 0,
  others              numeric NOT NULL DEFAULT 0,
  money_total         numeric,
  -- Statistics (12 fields, all integers — see _prototype/EXTRACTED-SPEC.md §1.5)
  births              integer NOT NULL DEFAULT 0,
  marriages           integer NOT NULL DEFAULT 0,
  deaths              integer NOT NULL DEFAULT 0,
  converts            integer NOT NULL DEFAULT 0,
  baptisms            integer NOT NULL DEFAULT 0,
  workers             integer NOT NULL DEFAULT 0,
  ministers           integer NOT NULL DEFAULT 0,
  disciplinary        integer NOT NULL DEFAULT 0,
  new_parishes        integer NOT NULL DEFAULT 0,
  new_nations         integer NOT NULL DEFAULT 0,
  church_dedication   integer NOT NULL DEFAULT 0,
  projects            integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mreport_report_lines_report_idx
  ON mreport_report_lines (report_id, entry_date);
CREATE INDEX mreport_report_lines_tenant_date_idx
  ON mreport_report_lines (tenant_id, entry_date DESC);

-- ----------------------------------------------------------------------------
-- mreport_audit_log
-- Per-app audit log (mirrors cem_audit_log). Email is masked (h***@aol.com)
-- so a leaked log can't enumerate the member roster — full email is
-- recoverable via member_id → core_users.email.
-- ----------------------------------------------------------------------------
CREATE TABLE mreport_audit_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  actor_id            uuid REFERENCES core_users(id) ON DELETE SET NULL,
  actor_email_masked  text,
  action              text NOT NULL,                    -- code_sent, code_verified, report_submitted, report_amended, fix_applied, member_added, etc.
  target_type         text,                             -- 'report', 'member', 'parish', 'region'
  target_id           uuid,
  ip                  inet,
  user_agent_summary  text,
  metadata            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mreport_audit_log_tenant_time_idx
  ON mreport_audit_log (tenant_id, created_at DESC);
CREATE INDEX mreport_audit_log_actor_time_idx
  ON mreport_audit_log (actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX mreport_audit_log_action_time_idx
  ON mreport_audit_log (action, created_at DESC);
CREATE INDEX mreport_audit_log_target_idx
  ON mreport_audit_log (target_type, target_id) WHERE target_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- mreport_tenant_settings
-- Per-tenant configuration. Currently a placeholder — Slice 1 doesn't have
-- any per-tenant config (canonical rules are global). Slice 2+ may add:
--   - canonical_rule_overrides jsonb  (different remittance % per tenant)
--   - notification_preferences jsonb
--   - default_currency text
-- ----------------------------------------------------------------------------
CREATE TABLE mreport_tenant_settings (
  tenant_id           uuid PRIMARY KEY REFERENCES core_tenants(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- ENABLE RLS ON ALL MREPORT TABLES
-- Policies live in 0002_mreport_rls_policies.sql. Until 0002 lands, RLS is
-- enabled with no policies = zero rows visible. That's the safe default.
-- ----------------------------------------------------------------------------
ALTER TABLE mreport_regions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mreport_parishes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE mreport_user_scopes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mreport_reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mreport_report_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mreport_audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mreport_tenant_settings  ENABLE ROW LEVEL SECURITY;

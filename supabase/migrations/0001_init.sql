-- ============================================================================
-- 0001_init.sql — initial schema for mReport
--
-- All tables prefixed `q7m2_` per security spec §7.4 (random project prefix
-- to prevent table-name guessing in shared databases). RLS enabled on every
-- table; policies live in 0002_rls_policies.sql.
--
-- Schema mirrors the JSON shape documented in `_prototype/EXTRACTED-SPEC.md` §9
-- but normalized into proper tables for querying + audit.
-- ============================================================================

-- Role hierarchy: super_admin > regional_admin > parish_admin > preparer
CREATE TYPE q7m2_user_role AS ENUM ('super_admin', 'regional_admin', 'parish_admin', 'preparer');

-- ----------------------------------------------------------------------------
-- Regions: top-level org units (e.g., "Region 4")
-- ----------------------------------------------------------------------------
CREATE TABLE q7m2_regions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Parishes: each parish belongs to exactly one region
-- ----------------------------------------------------------------------------
CREATE TABLE q7m2_parishes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  region_id   uuid NOT NULL REFERENCES q7m2_regions(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, region_id)
);

-- ----------------------------------------------------------------------------
-- Members: approved users with role + scope (region for regional_admin, parish
-- for parish_admin/preparer). super_admin doesn't need region/parish scope.
--
-- `auth_user_id` links to Supabase's `auth.users` table once the user has
-- verified at least one magic-code login. Until then, the row exists with
-- `auth_user_id` NULL — that's how an admin "pre-approves" an email before
-- the person ever signs in.
-- ----------------------------------------------------------------------------
CREATE TABLE q7m2_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email         text NOT NULL UNIQUE,
  full_name     text,
  role          q7m2_user_role NOT NULL,
  region_id     uuid REFERENCES q7m2_regions(id) ON DELETE SET NULL,
  parish_id     uuid REFERENCES q7m2_parishes(id) ON DELETE SET NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- For GDPR Art. 17 (Slice 1.5): when set, the member's PII has been anonymized.
  anonymized_at timestamptz,

  -- Role/scope sanity: super_admin has neither, regional_admin needs region,
  -- parish_admin/preparer need parish.
  CONSTRAINT q7m2_members_scope_check CHECK (
    (role = 'super_admin'    AND region_id IS NULL AND parish_id IS NULL) OR
    (role = 'regional_admin' AND region_id IS NOT NULL) OR
    (role IN ('parish_admin', 'preparer') AND parish_id IS NOT NULL)
  )
);

CREATE INDEX q7m2_members_email_lower_idx ON q7m2_members (lower(email));
CREATE INDEX q7m2_members_role_idx ON q7m2_members (role);

-- ----------------------------------------------------------------------------
-- Reports: one row per submitted parish-month report. The full parsed JSON
-- lives in `raw_json` for audit/replay; key fields are denormalized for
-- fast filtering.
--
-- Amendment workflow: when a parish resubmits a month, the new report is
-- inserted with `is_amended = true` and `amendment_note` populated. The
-- old report is updated with `superseded_by = new_id`. Both rows persist
-- (per HGB §257 retention reading).
-- ----------------------------------------------------------------------------
CREATE TABLE q7m2_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id          uuid NOT NULL REFERENCES q7m2_parishes(id) ON DELETE RESTRICT,
  report_month       date NOT NULL,    -- always first day of month
  pastor_name        text,
  attendance_avg     numeric,
  total_offering     numeric,
  total_tithe        numeric,
  total_thanksgiving numeric,
  total_others       numeric,
  total_income       numeric,          -- offering + tithe + tnx + others
  submitted_by       uuid NOT NULL REFERENCES q7m2_members(id) ON DELETE RESTRICT,
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  is_amended         boolean NOT NULL DEFAULT false,
  amendment_note     text,
  superseded_by      uuid REFERENCES q7m2_reports(id) ON DELETE SET NULL,
  raw_json           jsonb NOT NULL,
  source_file        text,             -- Supabase Storage path
  CONSTRAINT q7m2_reports_amendment_note_check
    CHECK (NOT is_amended OR amendment_note IS NOT NULL)
);

CREATE INDEX q7m2_reports_parish_month_idx ON q7m2_reports (parish_id, report_month DESC);
CREATE INDEX q7m2_reports_submitted_by_idx ON q7m2_reports (submitted_by);
CREATE INDEX q7m2_reports_superseded_by_idx ON q7m2_reports (superseded_by);

-- ----------------------------------------------------------------------------
-- Per-date breakdown for queryability (e.g., "show me all Sunday tithe values
-- for Mount Zion in 2025"). Each row is one Sunday/midweek entry.
-- ----------------------------------------------------------------------------
CREATE TABLE q7m2_report_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         uuid NOT NULL REFERENCES q7m2_reports(id) ON DELETE CASCADE,
  entry_date        date NOT NULL,
  day_label         text,
  -- Attendance
  men               integer NOT NULL DEFAULT 0,
  women             integer NOT NULL DEFAULT 0,
  children          integer NOT NULL DEFAULT 0,
  attendance_total  integer,
  -- Money
  offering          numeric NOT NULL DEFAULT 0,
  tithe             numeric NOT NULL DEFAULT 0,
  thanksgiving      numeric NOT NULL DEFAULT 0,
  others            numeric NOT NULL DEFAULT 0,
  money_total       numeric,
  -- Statistics (12 fields, all integers)
  births            integer NOT NULL DEFAULT 0,
  marriages         integer NOT NULL DEFAULT 0,
  deaths            integer NOT NULL DEFAULT 0,
  converts          integer NOT NULL DEFAULT 0,
  baptisms          integer NOT NULL DEFAULT 0,
  workers           integer NOT NULL DEFAULT 0,
  ministers         integer NOT NULL DEFAULT 0,
  disciplinary      integer NOT NULL DEFAULT 0,
  new_parishes      integer NOT NULL DEFAULT 0,
  new_nations       integer NOT NULL DEFAULT 0,
  church_dedication integer NOT NULL DEFAULT 0,
  projects          integer NOT NULL DEFAULT 0
);

CREATE INDEX q7m2_report_lines_report_date_idx ON q7m2_report_lines (report_id, entry_date);

-- ----------------------------------------------------------------------------
-- Audit log: every state-changing action. Email is masked (h***@aol.com) so
-- a leaked log can't be used to enumerate the member roster. Real email is
-- recoverable via member_id → q7m2_members.email.
-- ----------------------------------------------------------------------------
CREATE TABLE q7m2_audit_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           uuid REFERENCES q7m2_members(id) ON DELETE SET NULL,
  actor_email_masked  text,
  action              text NOT NULL,         -- code_sent, code_verified, report_submitted, etc.
  entity_type         text,                  -- report, member, parish
  entity_id           uuid,
  ip                  inet,
  user_agent_summary  text,
  details             jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX q7m2_audit_log_member_time_idx ON q7m2_audit_log (member_id, created_at DESC);
CREATE INDEX q7m2_audit_log_action_time_idx ON q7m2_audit_log (action, created_at DESC);

-- ----------------------------------------------------------------------------
-- Enable RLS on every table. Policies live in 0002_rls_policies.sql.
-- A table with RLS enabled but no policies returns ZERO rows — that's the
-- safe default while we author policies.
-- ----------------------------------------------------------------------------
ALTER TABLE q7m2_regions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE q7m2_parishes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE q7m2_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE q7m2_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE q7m2_report_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE q7m2_audit_log    ENABLE ROW LEVEL SECURITY;

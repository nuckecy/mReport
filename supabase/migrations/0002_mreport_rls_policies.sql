-- ============================================================================
-- 0002_mreport_rls_policies.sql — RLS policies for mreport_* tables
--
-- Mirrors event-calendar's RLS pattern (drizzle/0001_rls_policies.sql).
-- Uses platform helper functions (already defined in event-calendar's
-- migration 0001):
--
--   public.is_platform_admin()  → bool
--   public.user_tenant_ids()    → SETOF uuid (active memberships only)
--
-- mReport's data model is more restrictive than event-calendar's:
--   - cem_events / cem_holidays / cem_departments are publicly readable
--     (they power public calendars and church pages)
--   - mreport_* data is FINANCIAL and confidential. NO public reads.
--     Every policy requires tenant membership (or platform admin bypass).
--
-- Service role bypasses RLS entirely (Supabase default). Used by:
--   - This migration's seed script (0003)
--   - Server-side admin endpoints (when explicitly opted into)
--
-- App-level role checks (super_admin / regional_admin / parish_admin /
-- preparer) happen in application code via lib/auth/access.ts (port from
-- event-calendar). RLS provides the *tenant-isolation* floor; the
-- *role-based* permission layer is enforced at the application layer.
-- (Defense in depth: RLS catches forgotten WHERE clauses; application
-- checks catch wrong-role-for-action mistakes.)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- mreport_regions
-- Tenant members can read regions in their own tenants. Writes follow the
-- same scope; the app-level guard restricts writes to super_admin /
-- regional_admin (and platform_admin via bypass).
-- ────────────────────────────────────────────────────────────────────────
CREATE POLICY "mreport_regions_tenant_only"
  ON public.mreport_regions FOR ALL
  USING (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  )
  WITH CHECK (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  );

-- ────────────────────────────────────────────────────────────────────────
-- mreport_parishes
-- Same pattern as regions. App-level guard restricts writes to admins.
-- ────────────────────────────────────────────────────────────────────────
CREATE POLICY "mreport_parishes_tenant_only"
  ON public.mreport_parishes FOR ALL
  USING (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  )
  WITH CHECK (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  );

-- ────────────────────────────────────────────────────────────────────────
-- mreport_user_scopes
-- Members can READ their own scope row (so the app knows where to send
-- them). Anyone in the tenant can READ all scopes (used by admin UI to
-- list "who's assigned to which parish"). WRITES restricted to admins
-- by app-level guards.
-- ────────────────────────────────────────────────────────────────────────
CREATE POLICY "mreport_user_scopes_tenant_only"
  ON public.mreport_user_scopes FOR ALL
  USING (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  )
  WITH CHECK (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  );

-- ────────────────────────────────────────────────────────────────────────
-- mreport_reports
-- Tenant members only. App-level guards further restrict by role+scope:
--   - preparer: can only read reports they themselves submitted
--   - parish_admin: can read all reports for their assigned parish
--   - regional_admin: can read all reports for parishes in their region
--   - super_admin (mReport-tenant-level): can read all in the tenant
--   - platform_admin: bypasses everything
--
-- The RLS layer here is the tenant floor — preventing reports from one
-- tenant being visible to another. Role/scope filtering is application-
-- level (in queries), since RLS can't easily reach into mreport_user_scopes
-- or core_tenant_user_roles within a single policy without performance
-- hit.
-- ────────────────────────────────────────────────────────────────────────
CREATE POLICY "mreport_reports_tenant_only"
  ON public.mreport_reports FOR ALL
  USING (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  )
  WITH CHECK (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  );

-- ────────────────────────────────────────────────────────────────────────
-- mreport_report_lines
-- Same as reports — tenant-scoped. Lines inherit visibility from their
-- parent report at the application layer.
-- ────────────────────────────────────────────────────────────────────────
CREATE POLICY "mreport_report_lines_tenant_only"
  ON public.mreport_report_lines FOR ALL
  USING (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  )
  WITH CHECK (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  );

-- ────────────────────────────────────────────────────────────────────────
-- mreport_audit_log
-- Reads restricted to platform admins ONLY. Audit log can leak metadata
-- about other users' actions — admin UI for it lives in Slice 2 with
-- proper role-scoped queries. For Slice 1, no in-app reads of audit log;
-- only direct DB inspection (via service-role) for incident response.
--
-- Writes accept any tenant member (every authenticated action writes its
-- own audit row).
-- ────────────────────────────────────────────────────────────────────────
CREATE POLICY "mreport_audit_log_read_admin_only"
  ON public.mreport_audit_log FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "mreport_audit_log_write_tenant_member"
  ON public.mreport_audit_log FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  );

-- ────────────────────────────────────────────────────────────────────────
-- mreport_tenant_settings
-- Tenant members can READ. Writes restricted to super_admin (app-level
-- guard) — the platform admin bypass still applies via RLS.
-- ────────────────────────────────────────────────────────────────────────
CREATE POLICY "mreport_tenant_settings_tenant_only"
  ON public.mreport_tenant_settings FOR ALL
  USING (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  )
  WITH CHECK (
    tenant_id IN (SELECT public.user_tenant_ids())
    OR public.is_platform_admin()
  );

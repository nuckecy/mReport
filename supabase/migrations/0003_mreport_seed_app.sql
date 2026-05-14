-- ============================================================================
-- 0003_mreport_seed_app.sql — register mReport in the platform's app catalog
--
-- Idempotent. Safe to re-run. Inserts the 'mreport' row in core_apps if it
-- doesn't already exist.
--
-- Tenant enablement (core_tenant_apps) and per-tenant settings rows are
-- created by the TS bootstrap script (scripts/seed-mreport-bootstrap.ts),
-- not here — they require deciding WHICH tenants get mReport, and that
-- decision is human-driven.
-- ============================================================================

INSERT INTO core_apps (slug, name, description, status)
VALUES (
  'mreport',
  'mReport',
  'Parish report extractor and validator. Ingests monthly parish .xlsx reports, validates against canonical remittance rules, and persists structured records.',
  'active'
)
ON CONFLICT (slug) DO NOTHING;

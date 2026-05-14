# Changelog

## Slice 1 (Days 0 – 8) — 2026-05-14

First production-ready slice. Magic-link sign-in, preparer upload + submit
with auto-fix, admin reports and members.

### Day 0 — Foundation
- Next.js 16 + TypeScript strict + Tailwind v4 + design tokens
- Button primitive, landing page, security headers
- Vitest + Playwright + CI workflow

### Day 0.5 — Platform integration reframe
- Investigated event-calendar for platform patterns
- Architectural decisions captured in `docs/ARCHITECTURE.md`
- Decided: subdomain routing, Hybrid auth (Supabase Auth + custom layer),
  `mreport_*` table prefix

### Day 1 — Platform DB setup
- 7 `mreport_*` tables + 2 enums + 8 RLS policies applied to live Supabase
- Registered `mreport` in `core_apps`, bootstrap super-admin seeded
- 1 region + 3 parishes for the demo tenant

### Day 2 — Tenant + auth integration
- Drizzle client, schema definitions, tenant lookup helpers
- `getSession({ appSlug: "mreport" })`, `requireAuth`, `checkAccess`
- Node.js middleware with session refresh + header sanitization

### Day 3 — Auth UI
- `/login` magic-link form (matches event-calendar's pattern, no OTP code entry)
- `/auth/callback` + `safeNextPath` open-redirect guard (7 regression tests)
- `/no-access` friendly view for signed-in-roleless users
- Card / Input / Label primitives

### Day 4 — Parser + validation + /upload
- Full TypeScript port of the prototype's parser (cells, dates, extract,
  template-validity, parseWorkbook) preserving every §11 bug fix
- Validation layer: buildChecks + gradeChecks + buildFailure (5 sub-types)
- `/upload` page with magic-byte sniff and parish-mismatch check
- 68 unit tests covering §11.1–§11.16 regressions

### Day 5 — Failure UI + auto-fix + submit pipeline
- Layout-C FailureCard, TemplateBanner, CompactSummary components
- Auto-fix patcher for Statistics totals (cell address known, severity=warn)
- JSON + 6-sheet XLSX downloads
- Storage bucket `mreport-reports` + 4 RLS policies (path:
  `<tenant>/<parish>/<YYYY-MM>.xlsx`)
- Submit server action: parish-mismatch enforcement, duplicate-month
  detection with amendment notes, Drizzle-transactional inserts +
  audit log entries

### Day 6 — Admin: members CRUD
- `/admin/members` for super_admin / platform_admin
- Invite (via Supabase Auth Admin API) / role + scope edit / deactivate
- Zod schemas in their own module so unit tests don't need a DB
- 16 unit tests for invite-form cross-field rules

### Day 7 — Admin: reports list + detail
- `/admin/reports` with parish/month/status filters (URL-state-driven)
- `/admin/reports/[id]` detail: status badge, per-date lines table,
  audit trail, collapsible raw JSON
- Signed-URL download (60s TTL) re-derives the storage key from the DB
  row, always audited
- 8 unit tests for `parseReportFilters`

### Day 8 — Polish + verification
- `SECURITY_AUDIT_REPORT.md` covering auth, RLS, audit, CSP, residency
- README rewritten with current Slice 1 surface
- This CHANGELOG
- E2E coverage extended to admin + upload route gating
- All quality gates green: format, typecheck, lint, build, 110+ unit
  tests, Playwright suite

## Deferred to Slice 1.5
- Scoped admin surfaces (regional_admin, parish_admin)
- Email notifications on submit / deactivate
- Pagination on the Supabase Auth `listUsers` call
- GDPR Art. 15 / 17 endpoints

## Deferred to Slice 2
- Aggregate dashboards (regional totals, trends)
- Audit-log viewer UI
- Per-tenant canonical-rule overrides
- Custom email branding
- Nonce-based CSP (drop `unsafe-inline`/`unsafe-eval`)

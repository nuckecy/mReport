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
- All quality gates green: format, typecheck, lint, build, 110 unit
  tests, Playwright suite

## Slice 1.5 (in progress): 2026-05-14 to 2026-06-06

Work layered on top of the signed-off Slice 1. The first two items are
committed; the theme rebrand is in the working tree, not yet committed.

### Workspace picker for bare-host visitors: committed (`9326bea`)
- `/workspace` picker shown when there's no tenant context (platform
  domain or bare `localhost` in dev); redirects to `/` when a tenant
  subdomain is already resolved
- Enter a workspace slug → resolve to the tenant subdomain and redirect
- Follow-up `e0f159f`: fixed a Zod 4 null-vs-undefined mismatch on the
  form's `next` field

### `/admin/region` cross-parish rollup: committed (`6b4197c`)
- Tenant-wide view aggregating parish reports across up to three months
- Multi-month picker driven by `?months=` URL state (max 3, malformed
  dropped); `sumTotals` pure reducer; per-month / per-parish rollup tables
- xlsx export of the multi-month rollup (`buildRegionWorkbook`)
- Region tab added to the admin nav
- Partially fulfils the Slice 2 "aggregate dashboards" item

### Stripe-inspired light/dark theme rebrand: in tree, uncommitted
- Re-themed the design-token layer from Cal.com dark-first (OKLCH) to a
  Stripe-inspired system: white surfaces + navy ink + indigo accent
  (light), cool blue-tinted dark; light is the new default
- `data-theme` → `data-mode`; shared token names keep components
  theme-agnostic (presentation-only change)
- 3-state ThemeToggle (light → dark → system) via `useSyncExternalStore`,
  multi-tab sync, live OS-change following in "system" mode
- Inline FOUC-prevention init script in `<head>` (sets `data-mode` before
  hydration); fonts switched to Inter + JetBrains Mono
- `ParsedDetails` moved `src/app/upload/` → `src/components/report/`
- Restyle pass across upload, admin/region, failure cards, reports detail
- Typecheck clean; 134 unit tests passing in this state
- See `docs/ARCHITECTURE.md` §15 for the full decision record

## Deferred to Slice 1.5
- Scoped admin surfaces (regional_admin, parish_admin)
- Email notifications on submit / deactivate
- Pagination on the Supabase Auth `listUsers` call
- GDPR Art. 15 / 17 endpoints
- Google Drive sync

## Deferred to Slice 2
- Aggregate dashboards: trends over time + charts (the `/admin/region`
  rollup shipped the cross-parish totals in Slice 1.5)
- Audit-log viewer UI
- Per-tenant canonical-rule overrides
- Custom email branding
- Nonce-based CSP (drop `unsafe-inline`/`unsafe-eval`) — note: the theme
  init script currently relies on `'unsafe-inline'` for `script-src`

# Progress Tracker

> The cross-session todo list. Update as you work. The TodoWrite tool is per-session
> and disappears when the conversation ends — this file persists.

**Status legend**: ⬜ pending · 🟡 in progress · ✅ done · 🚫 blocked · ⏸ paused

---

## Where we are right now

**Slice 1 is COMPLETE.** Days 0 through 8 shipped. The preparer flow,
admin flow, and verification deliverables are all live. See
[`CHANGELOG.md`](../CHANGELOG.md) for the day-by-day summary and
[`SECURITY_AUDIT_REPORT.md`](../SECURITY_AUDIT_REPORT.md) for the security
sign-off.

Next milestones (Slice 1.5 / Slice 2) are tracked at the bottom of this
file under "Deferred to Slice 1.5 / Slice 2".

mReport now has full auth plumbing in place:
- Drizzle ORM + postgres-js connected to the platform DB
- Schema definitions for `core_*` (mirrored read-only) and `mreport_*` (owned)
- Tenant resolution via subdomain (`<slug>.localhost` in dev, `<slug>.churchplatform.com` in prod)
- Supabase server + browser clients
- `checkAccess` + `isTenantMember` with mReport role vocabulary
- `getSession({ appSlug: "mreport" })` + `getPlatformSession` + `requireAuth`
- Next.js middleware running in Node.js runtime, with header sanitization + Supabase session refresh
- Dev server smoke-tested across bare/tenant/unknown hostnames — all 200

All quality checks green: format, typecheck, lint, build, unit tests.

mReport now has live tables and seed data in the platform's Supabase project:
- 7 `mreport_*` tables created with RLS enabled
- 8 RLS policies applied (mirroring event-calendar's pattern, using platform helpers)
- `mreport` registered in `core_apps`
- `Demo Church` tenant has mReport enabled
- `nuckecy@gmail.com` exists in `auth.users` + `core_users` (with `is_platform_admin=true`)
- Tenant membership + `super_admin` role assigned for mReport
- 1 region + 3 parishes seeded (Mount Zion Berlin, New Song Berlin, RCCG Fountain of Life Neumünster)

All quality checks green: format, typecheck, lint, unit tests, build.

---

## Slice 1 — submission flow + minimal admin

### Day 0 — Foundation ✅

- ✅ Tooling verified (Node 24, pnpm, git)
- ✅ Git initialized, prototype archived to `_prototype/`
- ✅ Next.js 16 scaffolded (App Router, TypeScript strict, Tailwind v4, ESLint, src/)
- ✅ `tsconfig.json` tightened (noUncheckedIndexedAccess, noImplicitOverride, etc.)
- ✅ Prettier + plugin-tailwindcss
- ✅ All deps installed (Supabase, TanStack Query, Zod, Lucide, xlsx, CVA, etc.)
- ✅ Cal.com-inspired design tokens in `src/app/globals.css`
- ✅ `cn()` helper at `src/lib/utils.ts`
- ✅ Inter font, Providers (TanStack Query)
- ✅ Button primitive (`src/components/ui/button.tsx`)
- ✅ Landing page with two equal-weight Log in / Upload buttons (stubs)
- ✅ Security headers in `next.config.ts` (CSP, HSTS, X-Frame, X-Content-Type, Referrer, Permissions)
- ✅ `lib/` skeleton: parser/types, validation/rules, format helpers, supabase/client
- ✅ `.env.example` with all required vars
- ✅ Vitest + RTL + jest-dom + first passing format-helper test
- ✅ Playwright + landing-page smoke E2E
- ✅ Supabase migration `0001_init.sql` (q7m2_ prefix — **needs rework, see Day 0.5**)
- ✅ GitHub Actions CI workflow (format, lint, typecheck, test, build, audit)
- ✅ README, .env.example, .gitignore additions (playwright, supabase local)
- ✅ Initial commit + pushed to https://github.com/nuckecy/mReport

### Day 0.5 — Reframe for platform integration ✅

- ✅ Read platform schema markdown (saved at `docs/platform-schema.md`)
- ✅ Investigated existing platform code (event-calendar app)
- ✅ Captured findings in `docs/ARCHITECTURE.md` (auth flavor = Hybrid, table
  prefix = `mreport_`, RLS uses `core_tenant_user_roles`)
- ✅ Captured platform integration plan in `docs/PLATFORM-INTEGRATION.md`
- ✅ Created `PROGRESS.md`, `CLAUDE.md`, `docs/auth-investigation.md`
- ✅ Decisions logged: tenant URL pattern (`<slug>.churchplatform.com/mreport`),
  mReport's own role vocabulary, shared service-role key

### Day 1 — Platform integration setup ✅

- ✅ `.env.local` written (gitignored) with shared Supabase credentials
- ✅ Read event-calendar's auth + RLS patterns (`db/schema/core.ts`,
  `drizzle/0001_rls_policies.sql`, `lib/auth/access.ts`)
- ✅ Verified DB connection + platform pre-reqs (helper functions, `core_*` tables)
- ✅ Removed obsolete `0001_init.sql` (with `q7m2_` prefix)
- ✅ Wrote `0001_mreport_init.sql` — 7 `mreport_*` tables, 2 enums, indexes,
  RLS enabled. References `core_*` for tenant/user FKs. timestamptz everywhere,
  `created_at/updated_at` NOT NULL, `metadata jsonb`.
- ✅ Wrote `0002_mreport_rls_policies.sql` — 8 policies using platform helpers
  `is_platform_admin()` and `user_tenant_ids()`. mReport data is tenant-only
  (no public reads) since it's financial.
- ✅ Wrote `0003_mreport_seed_app.sql` — registers `mreport` in `core_apps`
  (idempotent ON CONFLICT DO NOTHING)
- ✅ Wrote `scripts/seed-mreport-bootstrap.ts` — creates Supabase Auth user,
  links to `core_users`, sets `is_platform_admin=true`, adds tenant
  membership + `super_admin` role, seeds 1 region + 3 parishes. Idempotent.
  Run via `pnpm db:bootstrap`.
- ✅ Applied all migrations to live platform DB; verified row counts match
- ✅ Installed `tsx` and `dotenv` for the seed script
- ⬜ Configure Supabase Storage bucket for original .xlsx uploads (deferred
  to Day 4 when submit flow lands)

### Day 2 — Tenant + auth integration ✅

- ✅ Read event-calendar's `lib/tenant.ts`, `lib/auth/access.ts`, `lib/auth/session.ts`,
  `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `middleware.ts`, `db/index.ts`,
  `db/schema/core.ts`
- ✅ Installed drizzle-orm + postgres + drizzle-kit
- ✅ `drizzle.config.ts` (mostly for type generation; we don't generate
  migrations from Drizzle in Slice 1)
- ✅ `src/lib/db/index.ts` — Drizzle client with SSL, hot-reload guard
  (separate global key from event-calendar to avoid collisions)
- ✅ `src/lib/db/schema/core.ts` — mirrored from event-calendar (read-only)
- ✅ `src/lib/db/schema/mreport.ts` — Drizzle definitions for `mreport_*` tables
  (mReport role enum, report status enum, 7 tables with CHECK constraints,
  unique indexes, FK refs to `core_tenants` + `core_users`)
- ✅ `src/lib/tenant.ts` — `lookupCustomDomain`, `lookupTenantBySlug`,
  `lookupPrimaryDomain` (cached 60s with separate cache keys from
  event-calendar), `readTenantContextFromHeaders` with UUID-shape validation
- ✅ `src/lib/supabase/server.ts` (replaces Day 0 stub) + `src/lib/supabase/browser.ts`
- ✅ `src/lib/auth/access.ts` — `checkAccess` with mReport role vocabulary
  (`super_admin / regional_admin / parish_admin / preparer / platform_admin`),
  `isTenantMember`
- ✅ `src/lib/auth/session.ts` — `getSession`, `getPlatformSession`, `requireAuth`,
  `defaultLandingForRole`; defaults to `appSlug = "mreport"`; populates
  mReport scope (region/parish) from `mreport_user_scopes` when applicable
- ✅ `middleware.ts` — full port. Header sanitization, custom domain + subdomain
  resolution, Supabase session refresh, Node.js runtime declaration
- ✅ Removed obsolete `experimental.nodeMiddleware` flag (Next 16 makes Node
  middleware first-class; just declare `runtime: "nodejs"` in middleware config)
- ✅ Smoke-tested: dev server boots in <300ms; bare/tenant/unknown hostnames
  all return 200; middleware doesn't crash on DB lookups
- ✅ Wire login UI: server action → Supabase Auth → resolve mReport role → redirect
  (Day 3, completed)
- ✅ Wire `/auth/callback` for magic-link redirect-back (Day 3, completed)

### Day 3 — Auth UI (login + callback + no-access) — ✅ DONE

Auth model decision: **MAGIC LINK ONLY** (matches event-calendar). The user submits
their email, gets a one-tap link, clicks it, lands on `/auth/callback`. No 6-digit
code-entry UI. `shouldCreateUser: false` so /login is not a sign-up surface.

Parallel-agent run produced the design and reference research; integration was
sequential to avoid file conflicts.

- ✅ `src/components/ui/input.tsx`, `label.tsx`, `card.tsx` — token-driven primitives
- ✅ `src/lib/auth/redirect-safety.ts` — `safeNextPath` open-redirect guard
- ✅ `src/lib/auth/actions.ts` — `signOutAction`
- ✅ `src/app/login/actions.ts` — `signInWithMagicLinkAction` with Zod validation;
  builds tenant-scoped callback URL from request headers; 429 surfacing; generic
  success on every other path to avoid email-enumeration
- ✅ `src/app/login/LoginForm.tsx` — client component using React 19 `useActionState`,
  swaps to "Check your email" confirmation in-place; focus management; `role="alert"`
  + `aria-invalid` accessibility
- ✅ `src/app/login/page.tsx` — server component; reads tenant context for the
  workspace badge; redirects already-signed-in users to `next`; renders inline
  `?e=` callback error if present
- ✅ `src/app/auth/callback/route.ts` — `exchangeCodeForSession`; redirects to
  `/login?e=expired|invalid` on failure; uses request origin (multi-tenant safe)
- ✅ `src/app/no-access/page.tsx` — friendly-not-punishing; avatar block + status
  pill; `mailto:` "Contact admin" + `signOutAction` form
- ✅ `tests/redirect-safety.test.ts` — 7 unit tests covering open-redirect attack
  patterns (protocol-relative, backslash, URL-encoded, malformed)
- ✅ `tests/e2e/login.spec.ts` — 3 Playwright tests: form renders, invalid-email
  inline error, callback-error indicator
- ✅ All quality checks green: format, typecheck, lint, build, 12 unit tests,
  4 Playwright tests

### Day 4 — Upload + parse flow (auth-gated) — ✅ DONE

Full parser port from `_prototype/index.html` (3494 lines of mixed JS/HTML/CSS)
to typed TypeScript modules. Every regex, threshold, and §11 bug fix preserved
with regression coverage.

Parser layer (`src/lib/parser/`):
- ✅ `num.ts` — `NUM`, `round2` (coercion + monetary rounding)
- ✅ `cells.ts` — `findCell`, `findAllCells`, `valueRightOf`, `valueForHeaderLabel`,
  `scanSheetFor`, `findEmailInSheet`, `findMobileInSheet` (§11.1, §11.14)
- ✅ `dates.ts` — `excelDateToJS`, `parseStringDate`, `ymd`, `detectMonthYear`
  with pre-2000 guard, UTC re-anchor, German DD.MM.YYYY support
  (§11.2, §11.4, §11.5, §11.8)
- ✅ `extract.ts` — `STAT_FIELDS`, `extractPerDateRows`, `extractPerDateStatistics`,
  `readEnteredStatTotals`, `extractWeeklyTotals`, `readGrandTotalRow`,
  `readMonthlyAverageTotal/Demographics`, `readActualRemittance` with negative
  lookbehind on every percentage regex and all-column stop-marker sweep
  (§11.3, §11.6)
- ✅ `template-validity.ts` — structural + formula checks with round-percent
  snap (5¢ amount tolerance + 0.5% rate snap)
- ✅ `parseWorkbook.ts` — orchestrator producing the full `Report` shape,
  including 5 sanity checks at end of parse (§11.7)
- ✅ `types.ts` / `index.ts` — typed public surface

Validation layer (`src/lib/validation/`):
- ✅ `checks.ts` — `buildChecks` (30+ comparisons, intentional order),
  `gradeChecks` with per-check tolerance for banner/field parity (§11.10)
- ✅ `failures.ts` — `classifyFailure` (template-defect first per §11.15),
  `severityForCheck` (LABEL_SEVERITY first per §11.16), `cellAddressForCheck`,
  `formatterForCheck` (section-aware per §11.11), `isAutoFixable`,
  `explainFailure` (5 sub-type message templates), `buildFailure`
- ✅ `index.ts` — public surface + `categorizeChecks` for compact summary
- ✅ `CORRECT_TEMPLATE_URL` env var with safe local fallback

`/upload` page:
- ✅ `src/app/upload/page.tsx` — server component, auth-gated via `requireAuth`,
  passes session.scope.parishName to client for mismatch detection
- ✅ `src/app/upload/UploadDropzone.tsx` — drag-and-drop or click, magic-byte
  sniff (PK\\x03\\x04 ZIP signature), SheetJS parse, validation summary card
  with passed/failed/missing counts, expandable failed-check list, template
  issues + parish-mismatch warning panels, sign-out form in header
- ✅ Parish-mismatch check enforced for `preparer` and `parish_admin` roles;
  super_admin / regional_admin / platform_admin can upload any parish

Tests:
- ✅ `tests/parser/sheet-builder.ts` — synthetic WorkSheet helper (no fixtures
  needed; tests build sheets from 2D arrays)
- ✅ `tests/parser/cells.test.ts` — 12 tests covering §11.1, §11.3, §11.14
- ✅ `tests/parser/dates.test.ts` — 16 tests covering §11.2, §11.4, §11.5, §11.8
- ✅ `tests/parser/extract.test.ts` — 4 tests covering §11.3, §11.6, §11.8
- ✅ `tests/parser/parseWorkbook.test.ts` — 6 end-to-end tests covering §11.7,
  §11.9, §11.10 + error path
- ✅ `tests/validation.test.ts` — 13 tests covering §11.10, §11.11, §11.15, §11.16
- ✅ All quality checks green: format, typecheck, lint, build, 68 unit tests,
  4 Playwright tests

Known follow-ups (filed as future work, not blockers):
- The `classifyFailure` template-defect path relies on token substring match
  that fails on the current "X% of Total Y" label structure vs "X% of Y" in
  the message. The classifier behaves correctly when tokens match; the
  prototype carries the same limitation. Tracked for revisit when we touch
  the failure-card UI in Day 5.
- Rich failure cards (Layout C from the prototype) deferred to Day 5.
- Auto-fix patcher + Excel/JSON export deferred to Day 5.

### Day 5 — Failure UI + Submit flow — ✅ DONE

Full preparer end-to-end: failure cards, auto-fix patcher, Excel/JSON
downloads, and server-side submit with Storage + audit log + amendment
handling.

Failure UI (`src/components/failure/`):
- ✅ `FailureCard.tsx` — Layout-C card with clickable cell-pill (copy to
  clipboard), severity-tinted border/bg, sub-type chip, "Currently / Should be"
  pair, source line (statistics contributors join), probable-cause line for
  forgot-to-total, auto-fix CTA OR italic review text
- ✅ `TemplateBanner.tsx` — amber outdated-template variant with parsed
  rate badges (60% → 55%), structural-issues block, "Get correct template"
  CTA
- ✅ `CompactSummary.tsx` — all-clean fast path with 3 checklist rows
  (monetary/remittance/statistics) + Submit/Show-full CTAs

Auto-fix (`src/lib/parser/autofix.ts`):
- ✅ `applyPatch` mutates the SheetJS workbook in memory, clears cached
  display string + formula, returns `AppliedFix` log entry
- ✅ Guards: cell address required, sheet must exist, calc must be finite
- ✅ Wired into `UploadDropzone` — fix click → patch → re-parse → re-render
  → re-serialize bytes for the eventual submit

Downloads (`src/lib/exports/`):
- ✅ `json.ts` — `downloadReportJSON` + `reportFilename` helper
- ✅ `xlsx.ts` — 6-sheet workbook (Summary, Per-Date Detail, Weekly Totals,
  Allocation, Statistics, Sanity) with prototype's column widths

Submit pipeline (`src/lib/submit/`):
- ✅ Storage bucket `mreport-reports` + 4 RLS policies applied to live DB
  via `0004_mreport_storage_bucket.sql`. Path: `<tenant>/<parish>/<YYYY-MM>.xlsx`.
  Policies use a scalar `mreport_user_is_tenant_member(uuid)` wrapper
  because `user_tenant_ids()` is a SRF and Postgres forbids SRFs in policy
  expressions (workaround documented in the migration file).
- ✅ `path.ts` — `reportMonthDate`, `reportMonthSlug`, `storageKey`,
  `decodeBase64ToBytes` (pure helpers, unit tested)
- ✅ `types.ts` — `SubmitReportInputSchema` (Zod), `SubmitReportResult`
  tagged union with `needs_amendment_note` soft-failure
- ✅ `submitReport.ts` server action — auth via `requireAuth`, Zod parse,
  re-derive month from report (never trust client), parish-name lookup,
  parish-mismatch enforcement, duplicate-month detection (returns
  `needs_amendment_note` if a live submission exists for the same parish
  + month), Storage upload via SSR client (RLS-gated), Drizzle
  transaction wrapping mreport_reports insert + mreport_report_lines
  inserts + status='superseded' on prior live row (on amendment) + 2
  mreport_audit_log rows (file_uploaded + submitted/amended)
- ✅ Email masking on audit log (`al***@example.org`) — keeps just enough
  to identify the actor without storing full PII

UploadDropzone overhaul:
- ✅ State machine: idle → parsing → parsed → submission states
  (idle/submitting/success/error/needs_note)
- ✅ Template-invalid fast path renders only `TemplateBanner`
- ✅ All-clean fast path renders only `CompactSummary` with Submit CTA
- ✅ Otherwise renders failure list with per-card auto-fix
- ✅ Amendment note collected inline when server reports
  `needs_amendment_note` — user fills note + re-submits
- ✅ Session fix log card above the failure list ("3 fixes applied this
  session" with cell + old → new value)
- ✅ Download Summary (.xlsx) + Download JSON buttons

Tests:
- ✅ `tests/parser/autofix.test.ts` — 5 tests covering the patch outcome
  shape, guards (no cell, empty workbook, non-finite calc), preservation
  of unrelated cell metadata
- ✅ `tests/submit/path.test.ts` — 9 tests for date/slug/key/base64
  helpers
- ✅ `tests/exports.test.ts` — 4 tests for filename builder + workbook
  sheet structure
- ✅ All quality checks green: format, typecheck, lint, build, 86 unit
  tests, 4 Playwright tests

Known follow-ups (Day 6+):
- Email notifications on submit (preparer + parish_admin) — TBD provider
- Fix-button per-card disabled state during patching (currently only the
  submit button shows "Submitting…")
- Admin members CRUD UI is Day 6
- Admin reports list + detail with downloadable original .xlsx is Day 7

### Day 6 — Admin: members CRUD — ✅ DONE

`/admin/members` for super_admin / platform_admin. Invite, edit role + scope,
deactivate. Every action audited.

Scope decision: Day 6 gated to super_admin/platform_admin only. Scoped
admin surfaces (regional_admin = members in their region, parish_admin =
preparers in their parish) are deferred to Day 6.5/7 once we have the
report-detail UI to anchor them.

Auth + clients (`src/lib/auth/admin.ts`, `src/lib/supabase/admin.ts`):
- ✅ `requireAdmin()` — redirects to /login or /no-access; allows
  `super_admin` + `platform_admin`. `isAdminRole(role)` exported as
  pure predicate for UI use.
- ✅ `createSupabaseAdminClient()` — service-role-keyed client, cached,
  server-only. Used by the invite action for Supabase Auth admin API
  (`listUsers`, `createUser`). Loud warning in comments about scope.

Schemas (`src/lib/members/schemas.ts`):
- ✅ Lives separate from `actions.ts` so tests can import without
  pulling in Drizzle + admin Supabase client.
- ✅ `InviteMemberSchema` with `superRefine` cross-field rules:
  super_admin rejects scope, every other role requires exactly one
  of region/parish. Email normalized (trim+lowercase). Names trimmed.
- ✅ `UpdateRoleSchema`, `UpdateScopeSchema`, `DeactivateMemberSchema`
- ✅ `MemberActionResult` tagged union with reason codes

Queries (`src/lib/members/queries.ts`):
- ✅ `listMembers(tenantId)` — joins core_users + core_tenant_users +
  core_tenant_user_roles (mreport app) + mreport_user_scopes +
  mreport_regions + mreport_parishes. Sorted by display name.
- ✅ `listScopeOptions(tenantId)` — flat array of regions + parishes
  for the invite/edit form's scope select.

Actions (`src/lib/members/actions.ts`, `"use server"`):
- ✅ `inviteMemberAction` — list/create Supabase Auth user → upsert
  core_users + core_tenant_users + core_tenant_user_roles → upsert
  or clear mreport_user_scopes (cleared on super_admin) → audit log.
  Guards: existing active membership returns `already_member`. Wraps
  the DB ops in a single Drizzle transaction.
- ✅ `updateRoleAction` — upsert role on core_tenant_user_roles;
  drops scope row when promoting to super_admin; refuses self-modify.
- ✅ `updateScopeAction` — upsert mreport_user_scopes; refuses if both
  or neither set (matches the SQL CHECK).
- ✅ `deactivateMemberAction` — soft-delete via
  core_tenant_users.status='deactivated'; refuses self-modify.
- ✅ Every action calls `revalidatePath('/admin/members')` on success
  + writes a `mreport_audit_log` row with masked actor email + IP +
  user-agent summary.

UI:
- ✅ `/admin/layout.tsx` — `requireAdmin()` gates the entire `/admin/*`
  tree; minimal nav (just Members for now)
- ✅ `/admin/members/page.tsx` — server component; fetches members +
  scope options in parallel; renders MembersTable
- ✅ `MembersTable.tsx` — token-driven table with role badge, scope,
  status badge, Edit + Deactivate per row; inline feedback banner;
  modal dialogs for Invite / Edit / Deactivate (DialogShell helper,
  closes on backdrop click); scope select grouped by Regions / Parishes
- ✅ Self-modify guards in the UI (disabled Deactivate for the current
  user, role/scope changes still allowed — actions enforce too)

Tests:
- ✅ 16 unit tests for the Zod schemas (cross-field branches,
  normalization, invalid emails/names, role transitions, scope
  combinations)
- ✅ Bug found + fixed: Zod 4 enforces strict UUID v1-v8 patterns;
  test fixtures updated from `11111111-...` to real v4-shaped UUIDs
- ✅ All quality checks green: format, typecheck, lint, build, 102
  unit tests, 4 Playwright tests

Known follow-ups (Day 7+):
- Regional/parish-admin scoped admin surfaces (Day 6.5 or alongside
  Day 7 reports list)
- Email invite notification (currently we create the auth.users row
  but don't send a magic link automatically — they have to log in
  with the email/magic-link flow themselves)
- Pagination on listUsers (Day 6 scans the first 200; fine until
  any tenant approaches that limit)
- Replace the inline modal dialogs with a proper Dialog primitive

### Day 7 — Admin: reports list + detail — ✅ DONE

Filterable reports list at `/admin/reports`, per-report detail at
`/admin/reports/[id]`, signed-URL download of the original .xlsx (admin
audited), and a Reports tab added to the admin nav.

Queries + filters (`src/lib/reports/`):
- ✅ `filters.ts` — pure `parseReportFilters` that drops malformed
  parish UUIDs, malformed YYYY-MM month strings, and unknown statuses.
  `monthSlugToDate` converts "2025-10" → "2025-10-01" for the date column.
  Lives separate from `queries.ts` so unit tests don't pull in Drizzle.
- ✅ `queries.ts` — `listReports` (joins parishes + regions + submitter
  user, descending by submitted_at), `getReportById` (incl. raw_json +
  superseded_by + source_file), `listReportLines` (per-date rows for
  the detail table), `listAuditForReport` (timeline scoped to this
  target), `listParishesForTenant` (filter dropdown), and
  `listMonthsWithReports` (months that actually have data, for the
  month filter)

Signed-URL action (`src/lib/reports/actions.ts`):
- ✅ `createReportFileSignedUrlAction` re-derives the storage key from
  the report row + raw_json (never trusts the client). Wraps Supabase
  Storage's `createSignedUrl` with a 60s TTL and the `download`
  attachment filename. Audits `report.file_downloaded` to
  mreport_audit_log even on success — admin downloads always leave a
  trail. RLS already gates the storage objects, but the action also
  re-checks tenant ownership via the DB lookup (signed URLs would
  otherwise bypass RLS).

UI (`src/app/admin/`):
- ✅ `layout.tsx` updated — Reports tab added (first), Members tab
  second. Reports icon = FileSpreadsheet.
- ✅ `admin/page.tsx` redirects bare /admin → /admin/reports.
- ✅ `admin/reports/page.tsx` — server component; renders ReportsFilters
  + table with month / parish / region / income / submitter / status
  / submitted-at columns. Status badge uses good/warn/subtle tones.
  Each row links to the detail page via the month cell.
- ✅ `admin/reports/ReportsFilters.tsx` — client component; URL-state
  driven (parish/month/status). `useRouter().push` re-renders the
  server component with fresh data. Clear-filters button when any
  filter is active.
- ✅ `admin/reports/[id]/page.tsx` — detail view: back link, header
  (parish · month, region + submitter + timestamp), status badge,
  DownloadFileButton, optional amendment-note card, 6-stat totals
  grid, per-date lines table (date / day / attendance / money +
  total), audit-trail list, collapsible raw-JSON `<details>`.
- ✅ `admin/reports/DownloadFileButton.tsx` — client; calls the
  signed-URL action, then triggers the download via a transient `<a>`
  element. Surfaces error inline.

Tests:
- ✅ `tests/reports.test.ts` — 8 unit tests for `parseReportFilters`:
  empty input → all nulls; valid + malformed parish UUIDs; the 12
  valid YYYY-MM forms + 5 malformed ones (rejecting "2025-13",
  "2025-00", non-zero-padded months, ISO date strings, two-digit
  years); only the 3 enum status values are accepted; all three
  filters compose.

All quality checks green: format, typecheck, lint, build, 110 unit
tests, 4 Playwright tests.

Known follow-ups (Day 8+):
- Pagination on the reports list (Day 7 caps at 50 most-recent —
  works for now; Day 7.5/8 will add `?cursor=` once tenants hit it)
- Scoped admin filtering (regional_admin sees only their region's
  reports; parish_admin sees only their parish) — same Day 6.5/7
  follow-up that we deferred for members
- Replace the inline modal dialog scaffolding with a proper Dialog
  primitive — applies to both Reports and Members surfaces

### Day 8 — Polish + verification — ✅ DONE

Final-day items: security audit doc, README + CHANGELOG rewrite,
protected-routes E2E suite. Operational items (Vercel deploy, DPA on
file) are flagged as out-of-scope for code work.

- ✅ `SECURITY_AUDIT_REPORT.md` — 11 sections covering auth, RLS,
  Storage policies, service-role handling, audit trail, input
  validation, CSP/HSTS, EU residency, known limitations, testing
  posture, and sign-off
- ✅ `README.md` rewritten — Slice 1 status, current stack, all dev
  commands (incl. `pnpm db:bootstrap`), tenant subdomains in dev,
  full project layout, links to platform-integration + security
  docs
- ✅ `CHANGELOG.md` — day-by-day Slice 1 notes + explicit deferral
  list for Slice 1.5 + Slice 2
- ✅ `tests/e2e/protected-routes.spec.ts` — 5 tests verifying
  anonymous redirects: `/upload` bounces away from itself; all three
  admin routes redirect to `/login?next=/admin/members`; `/no-access`
  redirects to `/login`
- ✅ All quality gates: format, lint, typecheck, build, 110 unit
  tests, 9 Playwright tests

### Operational items (out of code scope)
- ⏸ Production deploy to Vercel — user-driven; one `vercel deploy`
  call from this repo
- ⏸ Privacy notice page + EU-residency confirmation — copy + Supabase
  DPA signature, both user-driven
- ⏸ Custom domain configuration in Vercel + Supabase Auth allowlist

---

## Deferred to Slice 1.5 / Slice 2

- Google Drive sync (Slice 1.5)
- Aggregate dashboards (regional totals, trends) — Slice 2
- Audit log viewer UI — Slice 2 (data is captured day one)
- Per-tenant canonical-rule overrides via `mreport_tenant_settings` — Slice 2+
- GDPR Art. 15 / Art. 17 endpoints (data access + erasure) — Slice 1.5
- Custom email branding — Slice 2

---

## Blockers (resolve before next work session)

None right now — Day 2 (tenant middleware + auth integration) is unblocked.

Past blockers (kept for history):
- ~~Supabase project access~~ → resolved Day 1 by reading event-calendar/.env
- ~~Confirm same Supabase project as event-calendar~~ → confirmed
  (`qvptudtzilpqbaffyfge`)
- ~~Platform schema deploy process~~ → I have psql + service-role key access;
  user has been kept in the loop on each migration applied

---

## Open questions to resolve in time

Not blocking now, but lurking:

- **Email delivery for magic codes / notifications** — does the platform have a
  configured provider (Resend, Postmark, SendGrid)? Check event-calendar's setup.
- **Where does Storage live?** Supabase Storage bucket within the same project,
  with `tenant_id` in the path. Confirm event-calendar's storage convention.
- **EU data residency** — confirm the platform's Supabase project is in
  `eu-central-1` (Frankfurt) or another EU region.
- **Whether RLS policies in event-calendar use a `current_tenant_id()` SQL
  function** or read tenant from JWT claims directly. Affects how mReport's
  policies are written.

---

## Decisions log (cross-reference to ARCHITECTURE.md)

Each entry: short title + one-line summary + date. Full reasoning lives in `ARCHITECTURE.md`.

- **2026-05-14** Slice 1 plan signed off (submission + minimal admin)
- **2026-05-14** Stack: Next.js 16, TypeScript strict, Tailwind v4, shadcn-style, Cal.com tokens, Inter, Supabase EU, TanStack Query, Vercel
- **2026-05-14** Single repo, Vitest + Playwright, `httpOnly` cookie sessions
- **2026-05-14** Layout C chosen for failure cards; amber variant for outdated-template warning
- **2026-05-14** Multi-tenant via subdomain (`<slug>.churchplatform.com`); tenant_id on every mReport row
- **2026-05-14** Same Supabase project as event-calendar (`qvptudtzilpqbaffyfge`, `eu-central-1` Frankfurt); mReport tables prefix `mreport_`
- **2026-05-14** Auth flavor = **Hybrid** (Supabase Auth backend + custom platform layer); mirror event-calendar's `getSession({ appSlug })` pattern
- **2026-05-14** Region/parish scope kept in mReport's own `mreport_user_scopes` table (not in `core_tenant_user_roles.role`)
- **2026-05-14** Tenant URL pattern = `<slug>.churchplatform.com/mreport` (path-based app routing, matching event-calendar)
- **2026-05-14** mReport-specific role vocabulary in `core_tenant_user_roles.role` (super_admin / regional_admin / parish_admin / preparer)
- **2026-05-14** Service-role key shared with event-calendar (same project, only one key allowed); user accepts conversation-isolation risk and declined rotation
- **2026-05-14** Day 1 applied: 7 mreport_* tables + RLS + mReport registered in core_apps + bootstrap super-admin (nuckecy@gmail.com) on `demo` tenant + 1 region + 3 parishes seeded
- **2026-05-14** Day 2: Drizzle + tenant + auth + middleware ported from event-calendar (mReport role vocabulary, defaults to appSlug="mreport"); dev server smoke-tested with tenant subdomains; HMR-safe DB client
- **2026-05-14** Day 5: Storage bucket `mreport-reports` (path `<tenant>/<parish>/<YYYY-MM>.xlsx`), RLS via scalar SRF wrapper (`mreport_user_is_tenant_member`), full Drizzle-tx submit pipeline with amendment handling and audit log
- **2026-05-14** Day 6: members admin gated to super_admin/platform_admin (regional/parish-admin scoping deferred to Day 6.5/7); Zod schemas in their own module so unit tests don't pull in Drizzle; Supabase admin client (service-role) wrapped + cached server-side
- **2026-05-14** Day 7: filterable reports list + detail with audit trail; signed-URL download (60s TTL) re-derives the storage key from the DB row and audits `report.file_downloaded` on success; URL-state-driven filters via `useRouter().push`; filters helper extracted to its own module for test isolation
- **2026-05-14** Day 8 — Slice 1 sign-off: SECURITY_AUDIT_REPORT covers auth/RLS/storage/audit/CSP; README + CHANGELOG rewrites; protected-routes E2E (`/upload`, `/admin/*`, `/no-access` redirect behaviors)

# Progress Tracker

> The cross-session todo list. Update as you work. The TodoWrite tool is per-session
> and disappears when the conversation ends — this file persists.

**Status legend**: ⬜ pending · 🟡 in progress · ✅ done · 🚫 blocked · ⏸ paused

---

## Where we are right now

**Slice 1 — Days 0, 0.5, 1, 2, 3, and 4 complete. Day 5 (submit flow + auto-fix) is next.**

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

### Day 5 — Failure UI + Submit flow

- ⬜ Rich failure cards (Layout C from prototype) — cell-pill, sub-type chip,
  Currently/Should-be value pair, probable cause, Fix CTA
- ⬜ Auto-fix patcher (Statistics only — `forgot-to-total` + cell address known)
- ⬜ Excel + JSON export of the parsed report
- ⬜ Server action: validate via Zod, write `mreport_reports` + `mreport_report_lines`,
  upload .xlsx to Supabase Storage, write `mreport_audit_log` entry
- ⬜ Email notifications (preparer + parish_admin) — Resend or Supabase email,
  TBD; check what event-calendar uses
- ⬜ Duplicate-month resubmission with required amendment note
- ⬜ Auto-fix flow (in-memory cell patch + re-validate, no re-upload) — Statistics
  fields only

### Day 6 — Admin: members CRUD

- ⬜ `/admin/members` page — list, add, edit, deactivate
- ⬜ Role + parish/region assignment (writes to `core_tenant_user_roles` + `mreport_user_scopes`)
- ⬜ Scoped by viewer's role (RLS-enforced, not just UI)

### Day 7 — Admin: reports list + detail

- ⬜ `/admin/reports` page — list with filter (parish, month, status)
- ⬜ Detail view with full parsed JSON + downloadable original .xlsx
- ⬜ Audit trail visible at the bottom of detail view

### Day 8 — Polish + verification

- ⬜ Re-run security checklist against Slice 1 build
- ⬜ Generate `SECURITY_AUDIT_REPORT.md` (per the security-handoff doc)
- ⬜ End-to-end Playwright test: upload → parse → verify → submit → see in admin
- ⬜ Production deploy to Vercel
- ⬜ Privacy notice page, EU-residency confirmation, Supabase DPA on file

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

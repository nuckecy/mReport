# Progress Tracker

> The cross-session todo list. Update as you work. The TodoWrite tool is per-session
> and disappears when the conversation ends — this file persists.

**Status legend**: ⬜ pending · 🟡 in progress · ✅ done · 🚫 blocked · ⏸ paused

---

## Where we are right now

**Slice 1 — Day 0 complete. Day 1 blocked pending platform integration setup.**

The Next.js project is scaffolded with design tokens, primitives, security headers,
the lib skeleton, Vitest + Playwright, the initial Supabase migration (which now
needs to be reworked for multi-tenant), and CI. Initial commit pushed to GitHub.

**Then context shifted:** mReport is part of a multi-tenant platform with existing
`core_*` tables and an existing reference app (`event-calendar`). We discovered this
mid-flight. The Day 0 schema migration uses the wrong prefix (`q7m2_`) and the wrong
auth model. It needs a rework before Day 1 can proceed.

**Auth flavor confirmed (post-investigation): Hybrid.** Supabase Auth is the backend
for credentials/sessions, but tenant resolution and role checks live in a custom
platform layer that mReport must integrate with — not invent.

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

### Day 0.5 — Reframe for platform integration 🟡

This wasn't in the original plan. Discovered when the user shared platform schema.

- ✅ Read platform schema markdown (saved at `docs/platform-schema.md`)
- ✅ Investigated existing platform code (event-calendar app at
  `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/`) — found full
  reference implementation: middleware, auth helpers, role checks, schema
- ✅ Captured findings in `docs/ARCHITECTURE.md` (auth flavor = Hybrid, table
  prefix = `mreport_`, RLS uses `core_tenant_user_roles`)
- ✅ Captured platform integration plan in `docs/PLATFORM-INTEGRATION.md`
- ✅ Created this `PROGRESS.md` and `CLAUDE.md` for cross-session continuity
- ⬜ **Rework `0001_init.sql`** — change prefix `q7m2_` → `mreport_`, drop
  `mreport_members`/`mreport_regions`/`mreport_parishes` standalone identity,
  rebuild around `core_*` integration:
  - mReport tables: `mreport_regions`, `mreport_parishes`, `mreport_user_scopes`,
    `mreport_reports`, `mreport_report_lines`, `mreport_audit_log`,
    `mreport_tenant_settings`
  - Add a one-time data migration to register `('mreport')` in `core_apps`
- ⬜ Adjust `src/lib/validation/rules.ts` — same content, but doc updates around
  `tenant_id` carrying through every check
- ⬜ Add `docs/auth-investigation.md` with the full investigation report (raw
  findings) for future reference

### Day 1 — Platform integration setup 🚫 BLOCKED

Blocking on user inputs (see "Blockers" section below).

- ⬜ Decide: do we use the same Supabase project as event-calendar (recommended)
  or a separate one (would require JWT trust setup)?
- ⬜ Get Supabase credentials wired into `.env.local`
- ⬜ Run revised `0001_mreport_init.sql` against the platform DB
- ⬜ Insert `('mreport', 'mReport', ...)` row into `core_apps`
- ⬜ Write `0002_mreport_rls_policies.sql` — policies that join through
  `core_tenant_user_roles` for role checks (mirroring event-calendar's pattern)
- ⬜ Write `0003_mreport_seed.sql` — one tenant + super-admin
  (`nuckecy@gmail.com`) + 1 region + 3 parishes + 5 mock members
- ⬜ Configure Supabase Storage bucket for original .xlsx uploads (private,
  tenant-scoped path)
- ⬜ Verify everything via a one-off test script

### Day 2 — Tenant + auth integration

- ⬜ Add `middleware.ts` modeled after event-calendar's — extract subdomain →
  resolve tenant → inject `x-tenant-id` / `x-tenant-slug` headers
- ⬜ Port (don't copy-paste) auth helpers from event-calendar:
  `src/lib/auth/session.ts` (`getPlatformSession`, `getSession`),
  `src/lib/auth/access.ts` (`checkAccess`, `requireAuth`)
- ⬜ Wire login UI: server action → Supabase Auth → resolve mReport role → redirect
- ⬜ Wire `/auth/callback` for magic-code redirect-back

### Day 3 — Upload + parse flow (auth-gated)

- ⬜ Build `/upload` page (drop zone, parse, validation summary)
- ⬜ Port the parser from `_prototype/index.html` to `src/lib/parser/` —
  TypeScript modules, full type coverage
- ⬜ Magic-byte validation on .xlsx upload
- ⬜ Show parsed validation summary before submit (existing prototype UX)
- ⬜ Parish-mismatch check (parish-from-template must match user's authorized
  parish via `mreport_user_scopes`)

### Day 4 — Submit flow

- ⬜ Server action: validate via Zod, write `mreport_reports` + `mreport_report_lines`,
  upload .xlsx to Supabase Storage, write `mreport_audit_log` entry
- ⬜ Email notifications (preparer + parish_admin) — Resend or Supabase email,
  TBD; check what event-calendar uses
- ⬜ Duplicate-month resubmission with required amendment note
- ⬜ Auto-fix flow (in-memory cell patch + re-validate, no re-upload) — Statistics
  fields only

### Day 5 — Admin: members CRUD

- ⬜ `/admin/members` page — list, add, edit, deactivate
- ⬜ Role + parish/region assignment (writes to `core_tenant_user_roles` + `mreport_user_scopes`)
- ⬜ Scoped by viewer's role (RLS-enforced, not just UI)

### Day 6 — Admin: reports list + detail

- ⬜ `/admin/reports` page — list with filter (parish, month, status)
- ⬜ Detail view with full parsed JSON + downloadable original .xlsx
- ⬜ Audit trail visible at the bottom of detail view

### Day 7 — Polish + verification

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

1. **Supabase project access**
   - Need: project URL + anon key + service_role key for the **same** Supabase
     project event-calendar uses. (Confirmed Day 0.5: same project, same DB,
     mReport tables coexist with `core_*` and `cem_*`.)
   - User said "I will provide all you need via MCP" — Supabase MCP needs to
     be installed in Claude Code first (`claude mcp add supabase npx -- -y
     @supabase/mcp-server-supabase@latest --access-token=YOUR_TOKEN`).
   - Alternative (faster): user pastes the three credentials and we use them
     directly without MCP.

2. **Confirm same Supabase project as event-calendar.** The investigation found
   the reference repo at `vibecoding/event-calendar/`. Read its `.env` (or ask
   user) to confirm the project URL — if it differs from what user provides,
   we have an architectural fork to resolve.

3. **Platform schema deploy process.** When mReport's migration adds tables,
   does the user run it directly, or is there a platform team / process to
   route through? Affects iteration speed but not architecture.

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
- **2026-05-14** Multi-tenant via subdomain (`<slug>.mreport.app`); tenant_id on every mReport row
- **2026-05-14** Same Supabase project as event-calendar; mReport tables prefix `mreport_`
- **2026-05-14** Auth flavor = **Hybrid** (Supabase Auth backend + custom platform layer); mirror event-calendar's `getSession({ appSlug })` pattern
- **2026-05-14** Region/parish scope kept in mReport's own `mreport_user_scopes` table (not in `core_tenant_user_roles.role`)

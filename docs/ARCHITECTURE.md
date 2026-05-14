# Architecture Decisions

> Why we built it this way. New decisions go here with a date and one-paragraph
> reason. If a future session needs to understand "why X?", this is the answer.

---

## 1. mReport is one app inside a multi-tenant platform

**Decision (2026-05-14):** mReport is not standalone. It coexists with at least one
other app (`event-calendar`, internal name `cem`) inside a shared platform. Tenants
("organizations" — churches, in our case) enable mReport per-tenant via the platform's
`core_tenant_apps` table.

**Why:** The user clarified mid-build that mReport joins an existing platform. The
shape of the platform (`core_*` tables, app registry, per-tenant role scoping) is
already defined and other apps already follow it.

**Consequence:**
- mReport tables get prefix `mreport_*`, matching `cem_*` convention.
- mReport reads `core_*` tables; we never write to them or change their schema.
- Tenant isolation is enforced via `tenant_id` column on every mReport row +
  RLS policies that join through `core_tenant_user_roles`.

---

## 2. Multi-tenancy via subdomain routing

**Decision (2026-05-14):** Tenants are identified by subdomain
(`rccg.mreport.app`, `methodist.mreport.app`). Custom domains supported via
`core_tenant_domains`.

**Why:** Cleanest tenant signal. URL itself tells you which tenant. Each tenant
feels like their own app. Vercel and Supabase both support this well. Standard
B2B SaaS pattern. Aligns with how event-calendar already works.

**Consequence:**
- Next.js middleware at `middleware.ts` extracts subdomain from `host` header,
  looks up `core_tenants.slug` (or `core_tenant_domains.domain`), and injects
  `x-tenant-id` / `x-tenant-slug` request headers.
- Local dev uses `<slug>.localhost:3000` (works in modern browsers).
- Every server-side handler reads tenant context from those headers — never
  trusts client-provided tenant ids.

---

## 3. Same Supabase project as event-calendar

**Decision (2026-05-14):** mReport tables live in the **same Supabase project**
as event-calendar and the platform's `core_*` schema. Same database. Single
Supabase Auth instance for the whole platform.

**Why:** Investigation found that event-calendar uses Supabase Auth + reads
`core_*` tables in the same project. Splitting mReport into its own project
would mean: (a) duplicate schema for `core_*` or (b) cross-project JWT trust
setup. Both are heavier than just adding tables to the existing project.
Tenant isolation is enforced by RLS, not by project separation.

**Consequence:**
- mReport migrations are applied to the platform's Supabase project.
- Schema deploys may need coordination with whoever owns the platform DB
  (TBD with the user).
- One auth instance, one cookie domain, one billing line.

---

## 4. Auth flavor: Hybrid (Supabase Auth backend + custom platform layer)

**Decision (2026-05-14, post-investigation):** mReport uses **Supabase Auth**
for credential handling and session management, then runs every authenticated
request through the platform's **custom session-resolution layer**
(`getSession({ appSlug: "mreport" })`) to determine tenant + role context.

**Why:**
- Investigation discovered that event-calendar already implements this exact
  pattern. The platform's `core_users.password_hash` column is vestigial —
  not used by the active auth flow. Supabase Auth is the actual credential
  store.
- Building a parallel auth system would be wasteful and would diverge from
  the rest of the platform.
- Supabase Auth gives us magic-code OTP, password fallback, session refresh,
  CSRF defaults, and rate limiting "for free."
- The custom platform layer wraps Supabase's session with tenant + role
  context (which Supabase Auth can't know about — those concepts live in
  `core_tenant_user_roles` and `core_tenant_users`).

**Consequence:**
- mReport's login UI calls `supabase.auth.signInWithPassword()` or
  `supabase.auth.signInWithOtp()` (matching event-calendar's flow).
- After Supabase returns a session, mReport calls a `getSession({ appSlug:
  "mreport" })` helper that:
  1. Reads the Supabase session from cookies.
  2. Looks up `core_users` by `auth.uid()`.
  3. Looks up tenant from middleware-injected headers.
  4. Looks up the user's role for `(tenant_id, app_id=mreport_app_id)` in
     `core_tenant_user_roles`.
  5. Returns an `AppSession` with `{ userId, email, name, tenantId,
     tenantSlug, role, appSlug }`.
- mReport server actions call `requireAuth({ appSlug: "mreport" })` at the
  top to enforce this.
- We **port** these helpers from event-calendar (don't copy-paste); they
  become first-class modules in `src/lib/auth/`.

**Open detail to investigate:** event-calendar's exact session-storage choice
(httpOnly cookie via `@supabase/ssr` is the standard; needs verification).

---

## 5. Region/parish scope lives in mReport, not in the role string

**Decision (2026-05-14):** A new mReport-owned table `mreport_user_scopes`
links `(user_id, tenant_id)` to optional `region_id` and `parish_id`. The
`role` field in `core_tenant_user_roles` stays simple text
(`super_admin | regional_admin | parish_admin | preparer`).

**Why:** Three options were considered:
- Add `region_id` / `parish_id` columns to `core_tenant_user_roles`. Rejected:
  that table is platform-shared; mReport-specific columns there are awkward.
- Pack scope into the role string (e.g., `parish_admin:abc-123`). Rejected:
  dirty, unsearchable, doesn't compose with the existing role-text contract.
- **mReport owns its scope data.** Accepted: clean separation, mReport's
  schema decides its own granularity.

**Consequence:**
- Role lookups: `core_tenant_user_roles` (which app, what role).
- Scope lookups: `mreport_user_scopes` (which region/parish, if applicable).
- RLS policies on mReport tables join both.

---

## 6. Table prefix `mreport_*`, not `q7m2_*`

**Decision (2026-05-14):** All mReport tables get the prefix `mreport_`. The
original spec proposed a random `q7m2_` prefix for security-by-obscurity.

**Why:** The platform's existing convention is descriptive prefixes
(`core_*`, `cem_*`). Other apps follow this pattern openly. The
security-by-obscurity argument doesn't apply here — table names aren't a secret
in this DB. Discoverability and consistency outweigh obscurity.

**Consequence:**
- Day 0's `0001_init.sql` migration uses `q7m2_` and needs rework. The work
  isn't lost; the structural decisions all carry forward.
- Documented as a deliberate deviation from the original `EXTRACTED-SPEC.md`.

---

## 7. mReport-side deviations from platform table conventions

**Decision (2026-05-14):** mReport tables differ from platform conventions in
four specific ways. These are deliberate, documented in migration comments,
and apply only to `mreport_*` tables.

| Platform pattern | mReport deviation | Reason |
|---|---|---|
| `timestamp` (no zone) | `timestamptz` | Multi-timezone safety. `timestamp` is the most common Postgres timezone footgun. |
| Most timestamps nullable | `created_at` / `updated_at` `NOT NULL DEFAULT now()` | These are system-managed; null means a row slipped past audit. |
| `metadata text` (in audit log) | `metadata jsonb` | Queryable; supports indexed lookups. |
| FKs unclear in markdown | Explicit FKs on mReport's own relationships | Referential integrity within mReport's blast radius. |

**Why deviate?** Each of these is a known-unsafe pattern that produces real
bugs over time. We don't change the platform's existing tables (that's not
our place), but new tables in mReport's namespace get the safer defaults.

---

## 8. Layout choice for failure cards: Layout C

**Decision (2026-05-14):** Failure cards use Layout C from the prototype's
three-variant exploration: cell-address as section header, two-row currently/should-be
list, "probable cause" as small italic, primary auto-fix CTA.

**Why:** The user picked it after seeing all three variants stacked side by side
in the prototype.

**Consequence:** When porting failure cards to React components, this is the
only variant we keep. Layouts A and B are not implemented in v2.

---

## 9. Compact summary view for 100% clean reports

**Decision (2026-05-14):** When a report has zero failures and zero warnings,
show a compact summary view with three checklist rows (Monetary / Remittance /
Statistics) plus a "Submit your report" CTA. Full report is one click away.

**Why:** Most uploads are clean. Showing a 47-section report for the happy path
buries the user in detail they don't need. Compact view keeps the "submit"
moment friction-free; "Show full report" is there for power users.

**Consequence:** `render` has two paths. Compact path is the default for clean
reports; full path is forced via toggle or used automatically when there are
issues.

---

## 10. In-session auto-fix (no re-upload)

**Decision (2026-05-14):** When the parser detects a `forgot-to-total` error
on a non-monetary field (Statistics, attendance count), the user can click "Fix
this for me" to patch the in-memory workbook and re-validate. The fix lives
only in this browser session; the original .xlsx on disk is never touched.

**Why:** The most common error mode is "preparer added weekly entries but
forgot to update the totals row." The right answer is computable; making the
user fix Excel + re-upload is friction. For non-monetary fields the fix is
safe (sum of integer counts).

**Consequence:** Auto-fix scope is **strictly** non-monetary forgot-to-total.
Money fields, wrong-arithmetic, wrong-allocation, missing-entry, and
template-defect all require manual review + re-upload. Fixes are logged in
the `mreport_audit_log` so we know what was patched.

---

## 11. Documentation-first culture for this rebuild

**Decision (2026-05-14):** Significant decisions are documented in
`docs/ARCHITECTURE.md` BEFORE the code that implements them is finalized.
`docs/PROGRESS.md` is updated as work happens. `CLAUDE.md` points future
sessions at both.

**Why:** This project has many decisions per session. Without docs, future
Claude sessions (and future humans) will re-litigate decisions, invent
parallel patterns, or lose context entirely.

**Consequence:**
- Claude is expected to read these docs at the start of each session.
- New decisions add an entry here with one-line "why."
- PROGRESS.md is updated when work completes or blockers arise.

---

## Decisions still to make (not yet locked in)

These are listed in `PROGRESS.md` under "Open questions" and "Blockers."
Add to ARCHITECTURE.md once locked:

- Email delivery provider for magic codes + notifications (check what
  event-calendar uses)
- Storage path convention for original .xlsx uploads
- Whether RLS policies use a `current_tenant_id()` SQL function or read
  from JWT claims directly (mirror event-calendar's choice)
- EU residency confirmation

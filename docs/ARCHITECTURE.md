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

## 12. Tenant URL pattern: `<slug>.churchplatform.com/mreport`

**Decision (2026-05-14, post-investigation):** mReport routes live under
`/mreport/*` on the existing tenant subdomain (`<slug>.churchplatform.com`).
Apps are differentiated by URL path, not by per-app subdomain.

**Why:** Reading event-calendar's `middleware.ts` showed the platform's
current model: subdomain identifies the tenant, app routes live under that.
Introducing per-app subdomains (e.g., `<slug>.mreport.churchplatform.com`)
would fork the platform's tenant-domain model and require DNS + middleware
changes everywhere. Path-based app routing is what's already working.

**Consequence:**
- mReport's pages live at `/mreport/upload`, `/mreport/admin/members`, etc.
- Middleware is shared across all apps on the platform — it does tenant
  resolution; app routing is just paths.
- mReport doesn't need to add a new wildcard DNS record; the existing
  `*.churchplatform.com` covers it.

## 13. Role vocabulary: mReport-specific (`super_admin / regional_admin / parish_admin / preparer`)

**Decision (2026-05-14):** mReport uses its own role strings in
`core_tenant_user_roles.role`, distinct from event-calendar's vocabulary
(`member / lead / admin / superadmin / platform_admin`).

**Why:** The platform's `core_tenant_user_roles.role` column is `text`
specifically so each app can use vocabulary that fits its domain. mReport's
roles map to church-finance-reporting concepts (region, parish, preparer)
that don't have clean translations to event-calendar's generic
member/lead/admin terms. Reading a role of `parish_admin` immediately tells
you what the user does; `lead` would require domain knowledge to interpret.

**Consequence:**
- mReport-specific roles are distinct rows in `core_tenant_user_roles`
  filtered by `app_id = mreport_app_id`.
- A user can be `lead` in event-calendar AND `super_admin` in mReport for
  the same tenant — different rows, no conflict.
- Future admin tooling that spans apps will need to render role strings
  app-aware. Document that as a known requirement when admin UI gets built.
- `core_users.is_platform_admin = true` still bypasses everything — that's
  a platform-level concern, not per-app.

## 14. Service-role key shared with event-calendar

**Decision (2026-05-14):** mReport uses the same Supabase service-role key
as event-calendar, copied into mReport's `.env.local`. Both apps use the
same key for the same project.

**Why:** Same Supabase project = same key. Supabase only allows one
service-role key per project. The user explicitly accepted the conversation-
isolation risk (key was read in this session) and chose not to rotate.

**Consequence:**
- `.env.local` (gitignored) contains the same `SUPABASE_SERVICE_ROLE_KEY`
  value as `event-calendar/.env`.
- If the key ever leaks, both apps are affected — a single rotation fixes
  both, but coordination is needed (update both .env files at once).
- Production deployments: Vercel env vars (one per app) — **same value**
  across both apps' Vercel projects.

---

## 15. Visual theme: Stripe-inspired light/dark (supersedes Cal.com dark-first)

**Decision (2026-06-06, Slice 1.5):** The design-token layer in
`src/app/globals.css` was re-themed from the original Cal.com-inspired,
dark-first OKLCH palette to a Stripe-inspired system: white surfaces with
navy ink (`#0A2540`) and an indigo accent (`#635BFF`) in light mode, and a
cool blue-tinted dark mode. Light is now the default. Theme is selected by a
`data-mode` attribute on `<html>` (was `data-theme`), and users can switch
via a 3-state toggle (light → dark → system).

**Why:** A visual-direction change requested during Slice 1.5. The rebrand is
**presentation-only**: it touches token *values* and the mode-selection
mechanism, not component structure, data flow, or behavior. Component code
consumes token names, not raw colors, so the swap is contained to one file
plus the toggle and the layout's init script. This is exactly the
"edit the values in this file" escape hatch the original token design
anticipated; we took it.

**Why a `data-mode` attribute + inline init script (not CSS-only
`prefers-color-scheme`):** Users wanted an explicit override (some prefer
light even on a dark OS, and vice-versa). A stored preference has to win over
the OS, which means reading `localStorage` before first paint, otherwise
dark-preferring users get a flash of light. The inline script in `<head>`
sets `data-mode` synchronously before React hydrates; `<html>` carries
`suppressHydrationWarning` because the attribute is written by the script,
not the server. Absence of a stored value means "system," resolved live via
`matchMedia`.

**Consequence:**
- `globals.css` defines tokens under `[data-mode="light"]` (also `:root`,
  the default) and `[data-mode="dark"]`. Both modes define the **same token
  names** (only values differ), so downstream component code is
  theme-agnostic, unchanged from before.
- The mode attribute renamed from `data-theme` to `data-mode`. Any future
  code or docs referencing `data-theme` is stale.
- `src/components/theme/ThemeToggle.tsx` is the only runtime writer of
  `data-mode` after first paint. It uses `useSyncExternalStore` over
  `localStorage` (key `mreport-theme`), syncs across tabs via the `storage`
  event, and follows OS changes live while in "system."
- **CSP coupling:** the inline init script depends on the CSP allowing
  `'unsafe-inline'` for `script-src` (already the case). The deferred Slice 2
  move to a nonce-based CSP must give this script a nonce, or the theme will
  flash on first paint.
- Supersedes the Day-0 stack note ("Cal.com tokens") and the dark-first
  assumption baked into earlier sections. Those described the prior palette;
  this section is the current source of truth for the visual layer.
- **Status: in the working tree, not yet committed** as of 2026-06-06.

---

## Decisions still to make (not yet locked in)

These are listed in `PROGRESS.md` under "Open questions" and "Blockers."
Add to ARCHITECTURE.md once locked:

- Email delivery provider for magic codes + notifications (check what
  event-calendar uses)
- Storage path convention for original .xlsx uploads
- Whether RLS policies use a `current_tenant_id()` SQL function or read
  from JWT claims directly (mirror event-calendar's choice)
- EU residency confirmation (event-calendar uses `eu-central-1` Frankfurt
  per its `.env` comment — confirmed ✓)

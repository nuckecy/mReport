# Platform Integration Guide

> **How mReport plugs into the larger platform.** Practical guide for the auth flow,
> tenant resolution, role checks, and table relationships. Read this before writing
> any code that touches `core_*` tables, middleware, or session helpers.
>
> The reference implementation is the **event-calendar** app at
> `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/`. When in doubt about
> a pattern, look there first.

---

## High-level picture

```
                    ┌───────────────────────────────────┐
                    │     Browser (mreport.app)         │
                    └─────────────┬─────────────────────┘
                                  │ HTTPS
                                  ▼
                    ┌───────────────────────────────────┐
                    │  Next.js — middleware.ts          │
                    │   • Resolve tenant from subdomain │
                    │   • Refresh Supabase session      │
                    │   • Inject x-tenant-* headers     │
                    └─────────────┬─────────────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────────────┐
                    │  Route handler / server action    │
                    │   • requireAuth({ appSlug:        │
                    │       "mreport" })                │
                    │   • Returns AppSession            │
                    └─────────────┬─────────────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────────────┐
                    │  Drizzle queries against:         │
                    │   • core_*  (read-only)           │
                    │   • mreport_*  (read + write)     │
                    └─────────────┬─────────────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────────────┐
                    │  Supabase (single project)        │
                    │   • Auth (Supabase Auth)          │
                    │   • Postgres (core + cem + mr)    │
                    │   • Storage (xlsx originals)      │
                    └───────────────────────────────────┘
```

---

## Auth flow — the whole thing in one diagram

```
USER opens https://rccg.mreport.app/upload
   │
   ▼
[Vercel routes to Next.js]
   │
   ▼
[middleware.ts runs first]
   ├─ extracts host = "rccg.mreport.app"
   ├─ lookup core_tenants WHERE slug = "rccg"
   ├─ lookup core_tenant_apps WHERE tenant_id = X AND app_id = mreport_app_id
   │     → must exist AND enabled = true (else 404 / "app not enabled")
   ├─ refresh Supabase session if cookie present
   ├─ inject headers: x-tenant-id, x-tenant-slug
   └─ continue
   │
   ▼
[/upload page (server component) calls requireAuth({ appSlug: "mreport" })]
   │
   ├─ if no Supabase session → redirect("/login")
   │
   ├─ get core_users row by auth.uid()
   │     → 404 if no row (user signed up via Supabase Auth but not provisioned in core_users)
   │
   ├─ get core_tenant_users row WHERE (tenant_id, user_id)
   │     → 403 if user doesn't belong to this tenant
   │
   ├─ get core_tenant_user_roles row WHERE (tenant_id, user_id, app_id=mreport)
   │     → 403 if no role assigned
   │     → bypass if core_users.is_platform_admin = true
   │
   ├─ get mreport_user_scopes row WHERE (tenant_id, user_id) [optional, for region/parish]
   │
   └─ return AppSession {
       userId, email, name,
       tenantId, tenantSlug,
       role,                            // "super_admin" | "regional_admin" | "parish_admin" | "preparer"
       appSlug: "mreport",
       scope: { regionId?, parishId? }  // mReport-specific
     }
   │
   ▼
[Page renders with session]
```

---

## What lives where

### Owned by the platform (we read, never write)

| Table | What it tells us |
|---|---|
| `core_tenants` | Maps `slug` → `tenant_id`. Used by middleware. |
| `core_tenant_domains` | Maps custom domain → `tenant_id`. For tenants with their own domains. |
| `core_users` | The user master. Email + name + platform_admin flag. PK is the same as Supabase Auth's `auth.uid()`. |
| `core_tenant_users` | Membership: which tenants a user belongs to. |
| `core_tenant_member_profiles` | Per-tenant rich profile (phone, city, opt-ins). Optional. |
| `core_apps` | App registry. Must contain a row with `slug = 'mreport'` before any tenant can enable mReport. |
| `core_tenant_apps` | Which apps each tenant has enabled. mReport requires `enabled = true` for the tenant. |
| `core_tenant_user_roles` | Role assignments per `(tenant, app)`. mReport reads rows where `app_id = mreport_app_id`. |

### Owned by mReport (we read + write)

| Table | What it holds |
|---|---|
| `mreport_regions` | Tenant-scoped region master. Some tenants have a regional layer above parishes. |
| `mreport_parishes` | Tenant-scoped parishes. Each belongs to a region. |
| `mreport_user_scopes` | Per-user region/parish assignment within mReport. (Carries the scoping that doesn't fit in `core_tenant_user_roles.role` text field.) |
| `mreport_reports` | Submitted parish-month reports. Full parsed JSON in `raw_json`, plus denormalized key fields. |
| `mreport_report_lines` | Per-date breakdown of each report (one row per dated entry). |
| `mreport_audit_log` | Per-app audit log (mirrors `cem_audit_log`). |
| `mreport_tenant_settings` | Per-tenant config (placeholder for future canonical-rule overrides). |

---

## Role hierarchy (mReport-specific)

Stored as text in `core_tenant_user_roles.role` where `app_id = mreport_app_id`:

| Role | Scope | Can do |
|---|---|---|
| `super_admin` | Whole tenant | Everything within this tenant. Manage members, see all parishes. |
| `regional_admin` | One region (in `mreport_user_scopes`) | Manage parishes + members in their region. View region's reports. |
| `parish_admin` | One parish (in `mreport_user_scopes`) | Manage their parish's preparers. View their parish's reports. Get notified on submissions. |
| `preparer` | One parish (in `mreport_user_scopes`) | Submit reports for their parish. View only their own submissions. |

Plus `core_users.is_platform_admin = true` bypasses all checks (across all
tenants and apps). Reserved for the platform team.

---

## Setup mReport needs done in the platform DB

These are **one-time** setup steps to make mReport visible to the platform:

```sql
-- 1. Register mReport in the app catalog
INSERT INTO core_apps (slug, name, description, status)
VALUES ('mreport', 'mReport', 'Parish report extractor and validator', 'active');

-- 2. Enable for each tenant that should use it
INSERT INTO core_tenant_apps (tenant_id, app_id, enabled, enabled_at)
VALUES (<tenant_id>, (SELECT id FROM core_apps WHERE slug = 'mreport'), true, now());

-- 3. Assign roles to users (typically done via UI later, but bootstrap inserts:)
INSERT INTO core_tenant_user_roles (tenant_id, user_id, app_id, role, assigned_at, assigned_by)
VALUES (
  <tenant_id>,
  <user_id>,
  (SELECT id FROM core_apps WHERE slug = 'mreport'),
  'super_admin',
  now(),
  <super_admin_user_id>
);
```

These will live in the seed migration `0003_mreport_seed.sql`.

---

## What event-calendar does that we copy

When in doubt, read these files in `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/`:

| File | What it does | mReport equivalent |
|---|---|---|
| `middleware.ts` | Tenant resolution from subdomain/custom-domain → injects `x-tenant-*` headers | Port to `mReport/middleware.ts`; appSlug = "mreport" |
| `lib/auth/session.ts` | `getPlatformSession()` and `getSession({ appSlug })` helpers | Port to `mReport/src/lib/auth/session.ts` |
| `lib/auth/access.ts` | `checkAccess(userId, tenantSlug, appSlug)` — the 6-step check chain | Port to `mReport/src/lib/auth/access.ts` |
| `lib/supabase/server.ts` | Server-side Supabase client (uses `@supabase/ssr` for cookie reading) | Port to `mReport/src/lib/supabase/server.ts` |
| `lib/supabase/client.ts` | Browser client | Already at `mReport/src/lib/supabase/client.ts` (Day 0 stub) — verify against event-calendar's |
| `app/login/page.tsx` | Login UI: password + magic link | Port and adapt to mReport's design tokens |
| `app/auth/callback/route.ts` | Magic-code redirect handler | Port |
| `db/schema/core.ts` | Drizzle definitions for `core_*` tables | Reuse; mReport queries the same definitions |
| `drizzle.config.ts` | Drizzle setup pointing to platform DB | Port |
| `drizzle/` | Platform migrations | Reference only — we don't reapply them |

**Important:** **port** doesn't mean **copy-paste**. We extract the patterns,
maintain the same shape, but write them into mReport's own `src/lib/` so we
own the code (no submodule, no shared package). If event-calendar changes its
auth pattern, mReport doesn't auto-update — that's intentional, so a change
there can't accidentally break us.

---

## Things to confirm before Day 1 starts

Read event-calendar's `.env` and `lib/` to answer:

1. **Same Supabase project?** Confirm `SUPABASE_URL` matches what user provides.
2. **Session storage:** does event-calendar use httpOnly cookies (via
   `@supabase/ssr`)? That should be the answer. Verify.
3. **Email provider:** what's configured for magic-code OTP delivery? Likely
   Supabase's built-in email provider, but if event-calendar uses Resend or
   similar, we mirror.
4. **Tenant context in JWTs:** does event-calendar add custom claims to the
   Supabase JWT, or does it look up tenant per-request? Affects RLS policy
   shape.
5. **RLS helper functions:** does the platform have a SQL function like
   `current_user_tenant_id()` that policies use? We reuse if so.

These are quick reads of event-calendar's source — not blockers, just things
to verify before writing the analogous code in mReport.

---

## What we need from the user to start Day 1

(Cross-referenced from `PROGRESS.md` blockers.)

1. **Supabase project credentials** — URL + anon key + service_role key.
   Should be the same project as event-calendar.
2. **Confirmation we can write migrations to that project**, or designation
   of who runs them.
3. **The `tenant_id` for the bootstrap tenant** (the church organization
   that will be the first user — likely RCCG based on prior conversation).
   If the tenant doesn't exist yet, we provision it as part of seed.
4. **`nuckecy@gmail.com` already a `core_users` row?** If yes, we just
   assign the `super_admin` role for the tenant + mreport app. If no, we
   create the user via Supabase Auth + `core_users` insert as part of seed.

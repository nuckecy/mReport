# Auth Investigation — Raw Report

> **Verbatim findings** from the investigation that ran on 2026-05-14. The
> Explore agent searched for existing platform auth code and discovered the
> event-calendar app at `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/`.
> Decisions derived from this report are in `ARCHITECTURE.md`.

---

## Summary

A complete multi-tenant platform auth system exists and is actively used. The
platform uses Supabase Auth as its authentication backend, with custom tenant
resolution middleware and application-level role-based access control. The
event-calendar app is the reference implementation; mReport is a new app being
added to this platform.

## Repos / folders found

**Primary platform implementation (active reference):**

- `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/` — Next.js
  app; contains the full auth integration, schema, and patterns mReport
  should follow.
  - Framework: Next.js 15 (server components, server actions)
  - Auth: Supabase + custom platform layer
  - Database: PostgreSQL + Drizzle ORM
  - Password auth: Supabase Auth handles it; custom app logic does **not**
    use bcrypt/argon2 (those are Supabase's responsibility)

**mReport (new app, ready for integration):**

- `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/mReport/` — Next.js app with
  Supabase client stub in place, but no auth middleware or platform
  integration yet.

## Auth patterns identified

### 1. Auth backend: Supabase Auth (OAuth + password + magic link)

- No custom password hashing in the application code — Supabase handles JWT
  signing and session management
- Sessions stored in Supabase auth cookies (`sb-...` format)
- `getUser()` re-validates against the Supabase Auth server (not just cookie
  decoding)

### 2. Multi-tenant resolution

- Middleware (`/event-calendar/middleware.ts`) resolves tenant from hostname
  (subdomain or custom domain)
- Injects headers: `x-tenant-id`, `x-tenant-slug`, `x-domain-type` for
  downstream use
- Lookup tables: `core_tenant_domains` (custom domain → tenant), `core_tenants`
  (slug → UUID)

### 3. Session shape

```typescript
AppSession = {
  userId: string;          // Supabase Auth user.id
  email: string | null;    // From Supabase user metadata
  name: string | null;     // From Supabase user_metadata.name
  tenantId: string;        // UUID from core_tenants
  tenantSlug: string;      // Slug from hostname resolution
  role: "member" | "lead" | "admin" | "superadmin" | "platform_admin";
  appSlug: string;         // e.g., "cem" or "fold"
}
```

> **Note:** The role enum above is event-calendar's. mReport defines its own
> vocabulary (`super_admin | regional_admin | parish_admin | preparer`) — the
> shape is the same but the values differ per app.

### 4. Role resolution (application-level)

Two-function pattern:

- `getPlatformSession()` — no role, used for cross-app surfaces (launcher)
- `getSession({ appSlug })` — role **scoped to that app** in that tenant

Role lookup: `core_tenant_user_roles` table (`tenant_id`, `user_id`, `app_id`,
`role`). A user can be "Lead" in CEM and "Member" in another app
simultaneously.

### 5. Access control flow

- Middleware → Supabase session refresh
- Route handler/layout → `requireAuth({ appSlug: "mreport" })`
- `checkAccess(userId, tenantSlug, appSlug)` checks:
  1. User exists in `core_users`
  2. Tenant is active
  3. App exists in `core_apps`
  4. Tenant has app enabled (`core_tenant_apps.enabled = true`)
  5. User has role in `core_tenant_user_roles` for `(tenant, app)`
  6. Platform admin bypass flag (`core_users.is_platform_admin`)

### 6. Login flow

- `/login` page: password + magic link (OTP)
- Server action (`signInWithPasswordAction`): validates input, calls Supabase,
  resolves role, redirects to role-specific landing page
- Magic link: Supabase OTP → email → `/auth/callback` → session set →
  redirect to landing page

### 7. Database schema (platform core)

- `core_users` — global identity (Supabase user.id, email, name, avatar,
  password_hash nullable, platform_admin flag)
- `core_tenants` — organizations (id, name, slug, timezone, status)
- `core_apps` — app registry (id, slug, name)
- `core_tenant_apps` — which tenant has which app enabled
- `core_tenant_users` — user membership in a tenant (tenant_id, user_id,
  joined_at, status)
- `core_tenant_user_roles` — app-scoped roles (tenant_id, user_id, app_id, role)
- `core_tenant_domains` — custom domain mapping
- `core_tenant_member_profiles` — tenant-scoped rich profile data (phone,
  city, membership_status)

## Open questions (raised by investigation, to resolve later)

1. **How is password hashing handled?** The schema has `password_hash` but the
   code doesn't show hashing logic — likely delegated entirely to Supabase Auth
   behind `signInWithPassword()`.

2. **Is mReport expected to follow the same patterns?** The presence of a
   Supabase client stub in mReport suggests yes, but no middleware, auth
   helpers, or schema exists yet.

3. **Who manages the platform core tables?** (Migrations, seeding, admin UI
   for role assignment?) Not yet explored; likely in a separate platform
   management app or admin panel.

4. **What's the RLS policy setup?** The schema comments mention RLS but I
   haven't read the migration files to see the policies.

## Suggestion (the agent's recommendation)

This points to **Option 2 (Custom Platform Auth)** but more precisely:
**Hybrid (Option 3)**. The platform has a custom multi-tenant auth layer
**built on top of Supabase Auth**:

- Uses Supabase for authentication (password + magic link)
- Adds custom tenant resolution middleware
- Adds application-level role and access control via `core_*` tables
- Not pure Supabase Auth — it's augmented with custom orchestration

For mReport integration:

- Copy the auth pattern from event-calendar: middleware, `lib/auth/`,
  `lib/supabase/`, `lib/tenant/` helpers
- Add mReport to the `core_apps` registry (one-time setup)
- Follow the `requireAuth({ appSlug: "mreport" })` pattern in protected routes
- Use `getSession({ appSlug: "mreport" })` in route handlers and server
  components

## Key files to review directly

- `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/lib/auth/session.ts`
  — session helpers pattern
- `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/lib/auth/access.ts`
  — role/access check logic
- `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/middleware.ts`
  — tenant resolution
- `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/db/schema/core.ts`
  — core table definitions
- `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/drizzle/`
  — migrations for core tables

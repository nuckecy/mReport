# Platform Schema (Reference)

> **Read-only reference.** This document mirrors the platform's database schema as of
> 2026-05-14. mReport reads from `core_*` tables and conforms to the platform's
> conventions; we do not own these tables and must not modify them.
>
> The reference implementation we follow is the **event-calendar** (`cem_*`) app at
> `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/`.

---

## Naming convention

- **`core_*`** — platform-wide tables (tenants, users, app registry, roles, etc.). Shared across all apps.
- **`cem_*`** — event-calendar app tables. Reference implementation we model mReport after.
- **`mreport_*`** — mReport's own tables (regions, parishes, reports, lines, audit, scopes). All tenant-scoped.

---

## Platform `core_*` tables

### Table `core_tenants`
The tenant master. Subdomain routing: `<slug>.mreport.app` → tenant where `slug = 'rccg'`.

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  |
| `slug` | `text` | Unique |
| `logo_url` | `text` | Nullable |
| `timezone` | `text` | Nullable |
| `status` | `tenant_status` | Nullable |
| `created_at` | `timestamp` | Nullable |
| `updated_at` | `timestamp` | Nullable |

### Table `core_tenant_domains`
Custom-domain support per tenant.

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `tenant_id` | `uuid` |  |
| `domain` | `text` | Unique |
| `verification_status` | `domain_verification_status` | Nullable |
| `verification_token` | `text` | Nullable |
| `verified` | `bool` | Nullable |
| `ssl_provisioned` | `bool` | Nullable |
| `is_primary` | `bool` | Nullable |
| `created_at` | `timestamp` | Nullable |
| `verified_at` | `timestamp` | Nullable |
| `ssl_provisioned_at` | `timestamp` | Nullable |
| `added_by` | `uuid` | Nullable |

### Table `core_users`
Global identity. Supabase Auth handles credentials behind the scenes; `password_hash` exists for legacy/fallback but is not used by the active auth flow.

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `email` | `text` | Unique |
| `name` | `text` |  |
| `avatar_url` | `text` | Nullable |
| `password_hash` | `text` | Nullable |
| `is_platform_admin` | `bool` | Nullable |
| `email_verified` | `bool` | Nullable |
| `last_login_at` | `timestamp` | Nullable |
| `created_at` | `timestamp` | Nullable |
| `updated_at` | `timestamp` | Nullable |

### Table `core_apps`
App registry. mReport needs a row here with `slug = 'mreport'` before any tenant can enable it.

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `slug` | `text` | Unique |
| `name` | `text` |  |
| `description` | `text` | Nullable |
| `status` | `app_status` | Nullable |
| `created_at` | `timestamp` | Nullable |

### Table `core_tenant_apps`
Many-to-many: which apps each tenant has enabled. Composite primary key.

| Name | Type | Constraints |
|------|------|-------------|
| `tenant_id` | `uuid` | Primary |
| `app_id` | `uuid` | Primary |
| `enabled` | `bool` | Nullable |
| `enabled_at` | `timestamp` | Nullable |

### Table `core_tenant_users`
Many-to-many: which tenants each user belongs to. A user can belong to multiple tenants.

| Name | Type | Constraints |
|------|------|-------------|
| `tenant_id` | `uuid` | Primary |
| `user_id` | `uuid` | Primary |
| `joined_at` | `timestamp` | Nullable |
| `status` | `text` | Nullable |

### Table `core_tenant_member_profiles`
Per-tenant rich profile data.

| Name | Type | Constraints |
|------|------|-------------|
| `tenant_id` | `uuid` | Primary |
| `user_id` | `uuid` | Primary |
| `phone` | `text` | Nullable |
| `city` | `text` | Nullable |
| `joined_church_at` | `timestamp` | Nullable |
| `membership_status` | `member_status` | Nullable |
| `communication_email_opt_in` | `bool` | Nullable |
| `communication_sms_opt_in` | `bool` | Nullable |
| `notes` | `text` | Nullable |
| `created_at` | `timestamp` | Nullable |
| `updated_at` | `timestamp` | Nullable |

### Table `core_tenant_user_roles`
**Per-tenant, per-app roles.** This is where mReport's role assignments live (with `app_id = mreport_app_id`).

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `tenant_id` | `uuid` |  |
| `user_id` | `uuid` |  |
| `app_id` | `uuid` |  |
| `role` | `text` |  |
| `assigned_at` | `timestamp` | Nullable |
| `assigned_by` | `uuid` | Nullable |

The `role` field is `text` (not an enum) because each app defines its own role vocabulary. mReport will use:
- `super_admin` — global (within tenant)
- `regional_admin` — scoped to one region
- `parish_admin` — scoped to one parish
- `preparer` — scoped to one parish

Region/parish scope is held in mReport's own `mreport_user_scopes` table — see `ARCHITECTURE.md`.

---

## Reference app `cem_*` tables

The event-calendar app demonstrates the per-app table pattern. Notable shared pattern: `cem_audit_log` (one audit table per app, scoped by `tenant_id`). mReport mirrors with `mreport_audit_log`.

### Table `cem_audit_log`

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `tenant_id` | `uuid` |  |
| `actor_id` | `uuid` |  |
| `action` | `text` |  |
| `target_type` | `text` |  |
| `target_id` | `uuid` |  |
| `metadata` | `text` | Nullable |
| `created_at` | `timestamp` | Nullable |

(Other `cem_*` tables in the platform — birthdays, departments, events, holidays, notifications, requests, scriptures, tenant_settings — exist but are not consumed by mReport. Listed in the original schema dump for reference.)

---

## Patterns to copy

From reading event-calendar's implementation:

1. **Tenant resolution via middleware** — `middleware.ts` extracts subdomain/custom-domain → looks up `core_tenants` and `core_tenant_domains` → injects `x-tenant-id`, `x-tenant-slug`, `x-domain-type` headers on every request.

2. **Session shape** (`AppSession`):
   ```ts
   { userId, email, name, tenantId, tenantSlug, role, appSlug }
   ```

3. **Two session helpers**:
   - `getPlatformSession()` — no role; for cross-app surfaces (launcher, account settings)
   - `getSession({ appSlug })` — role scoped to that app in that tenant; for app-specific routes

4. **Access check** (`checkAccess(userId, tenantSlug, appSlug)`) verifies all of:
   1. User exists in `core_users`
   2. Tenant is active
   3. App exists in `core_apps`
   4. Tenant has the app enabled
   5. User has a role for `(tenant, app)` in `core_tenant_user_roles`
   6. `core_users.is_platform_admin = true` bypasses everything

5. **Auth backend = Supabase Auth.** Login via `signInWithPassword` or magic link / OTP. `getUser()` re-validates against the Supabase server (not just cookie decoding). Custom hashing logic does NOT exist in app code — Supabase manages credentials.

6. **Drizzle ORM** for type-safe queries against the same `core_*` and `<app>_*` tables.

---

## Patterns mReport will deviate from (and why)

| Platform pattern | mReport deviation | Reason |
|---|---|---|
| `timestamp` (no zone) | `timestamptz` | Multi-timezone safety. `timestamp` causes silent off-by-zone bugs. |
| Most timestamps nullable | `created_at`/`updated_at` `NOT NULL DEFAULT now()` | These are system-managed; null means a row slipped past audit. |
| `metadata text` in audit log | `metadata jsonb` | Queryable; supports indexed lookups. |
| FKs absent in markdown (unclear if defined in DB) | Explicit FKs on mReport's own tables; cross-app FKs to `core_*` only where safe | Referential integrity within mReport's blast radius. |

These deviations are documented in the migration files and `ARCHITECTURE.md`.

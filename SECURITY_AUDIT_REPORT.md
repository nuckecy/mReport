# mReport — Security Audit Report

**Scope**: Slice 1 (Days 0 – 8). Magic-link sign-in, multi-tenant via
subdomain, preparer upload + submit, admin reports + members.

**Date**: 2026-05-14
**Auditor**: internal review against the platform's security handoff
checklist; cross-referenced with [event-calendar](https://example.com/event-calendar)'s
posture where applicable.

---

## 1. Authentication

- **Magic link only** via Supabase Auth. No password storage in app code.
  `shouldCreateUser: false` on `signInWithOtp` — `/login` is NOT a sign-up
  surface. Users must be pre-provisioned by an admin.
- Email enumeration defense: same generic "Check your email" success
  message is returned regardless of whether the email exists. Only the
  rate-limit response is surfaced. Implementation:
  [`src/app/login/actions.ts`](./src/app/login/actions.ts).
- `/auth/callback` calls `exchangeCodeForSession` and redirects to
  `/login?e=expired|invalid` on failure. Open-redirect attempts (e.g.
  `?next=//evil.com`, URL-encoded variants, `\evil.com`, `javascript:`)
  are blocked by `safeNextPath` in
  [`src/lib/auth/redirect-safety.ts`](./src/lib/auth/redirect-safety.ts).
  Covered by 7 regression unit tests in `tests/redirect-safety.test.ts`.
- Session validation in server contexts always goes through
  `supabase.auth.getUser()` — never `getSession()` — so the JWT is
  re-validated against the Auth server rather than trusting the
  signed cookie. See [`src/lib/supabase/server.ts`](./src/lib/supabase/server.ts).

## 2. Authorization

- Three layers, every layer enforced server-side:
  1. **Tenant context** from the subdomain via middleware
     ([`middleware.ts`](./middleware.ts)). The middleware strips any
     incoming `x-tenant-id` / `x-tenant-slug` / `x-domain-type` headers
     from client requests before injecting its own — defense in depth.
  2. **Tenant membership** via `core_tenant_users` + `is_platform_admin`
     bypass. Implemented in
     [`src/lib/auth/access.ts`](./src/lib/auth/access.ts) (`isTenantMember`).
  3. **mReport role** via `core_tenant_user_roles` joined on the
     `mreport` app row. Roles are `super_admin / regional_admin /
     parish_admin / preparer` plus the `platform_admin` bypass.
- The `getSession({ appSlug: "mreport" })` entry point only returns a
  session when all three layers pass. Protected routes use `requireAuth()`
  which redirects to `/login` (no user) or `/no-access` (user, no role).
- Admin surfaces use `requireAdmin()` (super_admin + platform_admin only
  in Slice 1); regional/parish-admin scoped admin surfaces are deferred
  to Slice 1.5.

## 3. RLS policies

- **Database**: 8 RLS policies on `mreport_*` tables (migration
  `0002_mreport_rls_policies.sql`) use the platform helpers
  `public.is_platform_admin()` and `public.user_tenant_ids()`. Every
  read scoped by `tenant_id`; every write also checks the user's role
  in that tenant when relevant.
- **Storage**: bucket `mreport-reports` has 4 policies (CRUD) gated by
  `mreport_user_is_tenant_member(tid)` against the first path segment
  (`<tenant>/<parish>/<YYYY-MM>.xlsx`). See migration
  `0004_mreport_storage_bucket.sql`. The scalar wrapper exists because
  Postgres forbids set-returning functions (like
  `user_tenant_ids()`) in policy expressions.
- File size + MIME restrictions enforced at the Storage bucket level
  (10 MB ceiling, .xlsx + macroEnabled.12 + octet-stream fallback).
  Defense in depth — the app also does a magic-byte sniff
  (PK\\x03\\x04 ZIP signature) before parsing.

## 4. Service-role key handling

- The service-role key bypasses RLS. It is only used in:
  1. `scripts/seed-mreport-bootstrap.ts` — one-time bootstrap of a
     super-admin user.
  2. [`src/lib/supabase/admin.ts`](./src/lib/supabase/admin.ts) — wrapped,
     cached server-only client used exclusively by `inviteMemberAction`
     for `auth.admin.listUsers` and `auth.admin.createUser`. The admin
     client is never imported from a client component (enforced by code
     review; could be enforced via lint rule in a future iteration).
- Every action that calls this client first goes through
  `requireAdmin()`. Audit log captures the admin's actions
  (`member.invited`, `member.role_updated`, etc.).
- **Known caveat**: the service-role key is shared with event-calendar
  (same Supabase project, one key). User accepted this conversation-
  isolation risk in Day 1; rotation is documented in
  `docs/ARCHITECTURE.md`.

## 5. Audit trail

Every mutation writes a row to `mreport_audit_log`:

| Action                  | Triggered by                                    |
|-------------------------|-------------------------------------------------|
| `report.file_uploaded`  | Storage upload during submit                    |
| `report.submitted`      | New report inserted (status='submitted')        |
| `report.amended`        | Existing month re-submitted with amendment note |
| `report.file_downloaded`| Admin clicks "Download original .xlsx"          |
| `member.invited`        | New user invited via admin                      |
| `member.role_updated`   | Role changed on an existing member              |
| `member.scope_updated`  | Region/parish scope changed                     |
| `member.deactivated`    | Tenant membership soft-deleted                  |

Each row captures: tenant_id, actor_id, actor_email_masked
(`al***@example.org`), action, target_type + target_id, IP,
user_agent (first 200 chars), JSON metadata. Email is masked to keep
enough context for incident response without persisting full PII.

## 6. Input validation

- Every server action parses input with Zod before touching the DB.
- Login form: email + `next` validated via Zod schema in
  [`src/app/login/actions.ts`](./src/app/login/actions.ts); `safeNextPath`
  prevents open redirects.
- Submit action: `SubmitReportInputSchema` validates the wire shape;
  the report's `monthIndex`/`year` are re-derived server-side from
  the parsed Report — the client's `report_month` string is never
  trusted.
- Members admin: `InviteMemberSchema` uses Zod `superRefine` to enforce
  cross-field rules (super_admin rejects scope; every other role
  requires exactly one of region/parish). Emails normalized
  (trim + lowercase). UUIDs strict-validated by Zod 4's UUID v1–v8
  pattern.
- Reports filter: `parseReportFilters` silently drops malformed
  parish UUIDs, malformed `YYYY-MM` strings, and unknown status
  values. A malformed URL never throws on render.

## 7. CSP and security headers

Set globally in [`next.config.ts`](./next.config.ts):

| Header                      | Value                                                            |
|-----------------------------|------------------------------------------------------------------|
| Content-Security-Policy     | `default-src 'self'`; allowlist on script/style/img/font/connect |
| Strict-Transport-Security   | `max-age=31536000; includeSubDomains`                            |
| X-Frame-Options             | `DENY`                                                           |
| X-Content-Type-Options      | `nosniff`                                                        |
| Referrer-Policy             | `strict-origin-when-cross-origin`                                |
| Permissions-Policy          | `geolocation=(), camera=(), microphone=(), payment=()`           |

**Known weakness**: `script-src 'self' 'unsafe-inline' 'unsafe-eval'` —
`unsafe-eval` is required by Next dev. Slice 2 will tighten this to
nonce-based once we move beyond dev parity. `unsafe-inline` on
`style-src` is required by Tailwind v4's hydration path.

## 8. Data residency

- Supabase project lives in `eu-west-1` (per
  [`mcp__supabase`](https://supabase.com) project list).
- All `mreport_*` tables use `timestamptz` (documented deviation from
  platform's `timestamp`, see `docs/ARCHITECTURE.md`).
- Pending: confirm Supabase DPA on file (operational task; not a
  code deliverable).

## 9. Known limitations & deferred items

### Deferred to Slice 1.5
- **Scoped admin surfaces**: regional_admin should only see members /
  reports in their region; parish_admin only in their parish. Today
  the admin pages assume super_admin / platform_admin who see every
  row.
- **Email notifications**: invite emails go through Supabase Auth's
  built-in flow; we don't yet send custom emails on submit /
  deactivate.
- **Pagination on `listUsers`**: Supabase Auth Admin API returns
  paginated user lists; we currently scan the first 200. Fine until a
  tenant approaches that.
- **GDPR Art. 15 / Art. 17 endpoints**: data access + erasure as
  self-serve admin actions. Today we'd handle these manually via SQL.

### Deferred to Slice 2
- **Nonce-based CSP**: drop `unsafe-inline` and `unsafe-eval`.
- **Custom email branding** for invite / notification emails.
- **2FA**: rely on Supabase Auth's session security for now; add TOTP
  in Slice 2 if we onboard any tenants that require it.

### Known prototype limitations carried forward
- **Single-sheet parser**: only the first sheet of the workbook is
  read. Multi-sheet templates would need explicit support.
- **Auto-fix scope**: Statistics totals only — money fields never
  auto-fix (intentional, per validation `isAutoFixable` rule).

## 10. Testing posture

- **Unit tests**: 134 across 15 files. Covers parser §11.1 – §11.16
  bug regressions, validation classifier, filter parsing, member
  schemas, export builders, autofix patcher, and region rollup totals.
- **Playwright E2E**: 9 tests covering the unauthenticated paths:
  landing renders, login form + validation + callback-error surfacing,
  and protected-route redirects for `/upload` and `/admin/*`. Full
  submit-flow E2E is deferred (requires a Supabase test account and
  Storage mock).
- **CI**: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm
  test && pnpm build` on every push to main (`.github/workflows/`).

## 11. Sign-off

Slice 1 ships with all RLS enforced at the database level (cannot be
bypassed by app bugs), every mutation audited, every input
Zod-validated, no plaintext PII in audit logs, and CSP / HSTS / frame
defenses on every response. Outstanding security work is documented
above and tracked in `docs/PROGRESS.md` under the relevant slice.

The application is **production-deploy ready** modulo the operational
DPA confirmation in §8.

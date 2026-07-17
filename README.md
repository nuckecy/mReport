# mReport

Parish report extractor and validator. Ingests monthly parish `.xlsx` files,
validates them against canonical remittance rules, and persists structured
records with authentication, authorization, and an audit trail.

Part of a larger multi-tenant platform — mReport is one app inside a workspace
that may host other apps (e.g. event-calendar). See
[`docs/PLATFORM-INTEGRATION.md`](./docs/PLATFORM-INTEGRATION.md) for how it
plugs in.

## Status

**Slice 1 is complete** — see [`CHANGELOG.md`](./CHANGELOG.md) for the day-by-day
notes and [`docs/PROGRESS.md`](./docs/PROGRESS.md) for the cross-session
tracker.

What ships in Slice 1:

- **Auth**: magic-link sign-in via Supabase Auth, tenant-scoped sessions,
  role-based access (`super_admin / regional_admin / parish_admin / preparer`)
  on top of the platform's `core_*` tables.
- **Preparer flow**: drag-and-drop `/upload` → in-browser parse via SheetJS →
  Layout-C failure cards with auto-fix for Statistics totals → Submit, with
  amendment notes for duplicate months. Original `.xlsx` goes to Supabase
  Storage; parsed data lands in `mreport_reports` + `mreport_report_lines`.
- **Admin flow**: `/admin/reports` list with parish/month/status filters and
  per-report detail with audit trail + signed-URL download of the original
  file; `/admin/members` for invite / role + scope edit / deactivate.
- **Validation**: 30+ canonical checks, 16 documented bug-fix regressions from
  the prototype covered by 134 unit tests; outdated-template detection.

The single-file HTML prototype that informed this build is frozen in
[`_prototype/`](./_prototype/). The
[extracted spec](./_prototype/EXTRACTED-SPEC.md) is the source of truth for
every parser rule and validation threshold.

## Stack

- **Next.js 16** (App Router) + **TypeScript strict** (incl.
  `noUncheckedIndexedAccess`)
- **Tailwind CSS v4** + Cal.com-inspired design tokens + shadcn-style primitives
- **Inter** font, **Lucide** icons
- **Supabase** (Postgres + Auth + Storage + RLS) — EU region (`eu-west-1`)
- **Drizzle ORM** + `postgres-js` driver
- **TanStack Query** for server state, **React Context** for global UI state
- **Zod** for schema validation
- **SheetJS** for `.xlsx` parsing — runs in-browser, so workbooks never hit the
  server until the preparer submits
- **Vitest** + **React Testing Library** + **Playwright** for tests
- **Vercel** for hosting + preview deployments

## Local development

```bash
# Install deps
pnpm install

# Copy env template, fill in real values from your Supabase project + .env.local
# from another teammate (DO NOT commit .env.local)
cp .env.example .env.local

# Bootstrap the super-admin user (one-time, requires SEED_SUPER_ADMIN_EMAIL set)
pnpm db:bootstrap

# Dev server — http://localhost:3000
pnpm dev

# Unit tests
pnpm test

# Playwright E2E (boots the dev server automatically; installs Chromium on first run)
pnpm test:e2e

# Typecheck without emitting
pnpm typecheck

# Lint
pnpm lint

# Prettier
pnpm format        # write
pnpm format:check  # verify only

# Production build smoke test
pnpm build
```

### Tenant subdomains in development

The middleware reads tenant context from the host header. In local dev,
hit a tenant via `<slug>.localhost:3000` — e.g. `http://demo.localhost:3000`.
The bare `localhost:3000` resolves to no-tenant.

## Project layout

```
src/
├── app/                       # Next.js routes (App Router)
│   ├── layout.tsx             # root shell — Inter, Providers, dark theme
│   ├── page.tsx               # landing
│   ├── login/                 # magic-link sign-in
│   ├── auth/callback/         # exchangeCodeForSession handler
│   ├── no-access/             # signed-in but no role
│   ├── upload/                # preparer dropzone
│   └── admin/                 # /admin/reports + /admin/members
├── components/
│   ├── providers.tsx          # TanStack Query
│   ├── ui/                    # Button, Card, Input, Label
│   └── failure/               # FailureCard, TemplateBanner, CompactSummary
└── lib/
    ├── auth/                  # session, access, admin guards
    ├── parser/                # xlsx parser (cells, dates, extract, ...)
    ├── validation/            # buildChecks, gradeChecks, buildFailure
    ├── submit/                # submitReportAction + helpers
    ├── members/               # admin members CRUD
    ├── reports/               # admin reports queries + signed-URL action
    ├── exports/               # JSON + XLSX download builders
    ├── db/                    # Drizzle schema + client
    ├── supabase/              # server / browser / admin clients
    ├── tenant.ts              # subdomain → tenant context
    └── format.ts              # fmt / fmtCount / fmtSmart / formatLongDate
supabase/
└── migrations/
    ├── 0001_mreport_init.sql           # mreport_* tables + RLS
    ├── 0002_mreport_rls_policies.sql   # 8 RLS policies
    ├── 0003_mreport_seed_app.sql       # register mreport in core_apps
    └── 0004_mreport_storage_bucket.sql # mreport-reports bucket + policies
tests/
├── parser/                    # cells, dates, extract, parseWorkbook, autofix
├── submit/                    # path helpers
├── e2e/                       # Playwright
├── members.test.ts            # admin schema tests
├── reports.test.ts            # filter parser
├── exports.test.ts            # JSON + XLSX builders
└── validation.test.ts         # banner/field parity, classifier
docs/
├── PROGRESS.md                # cross-session tracker
├── ARCHITECTURE.md            # load-bearing decisions
├── PLATFORM-INTEGRATION.md    # how mReport plugs into core_*
└── platform-schema.md         # read-only mirror of platform's core_*
_prototype/
├── index.html                 # frozen single-file prototype
└── EXTRACTED-SPEC.md          # source of truth for the rebuild
```

## Source of truth

When in doubt about parser behavior, validation rules, formatting, or any UX
decision, reference [`_prototype/EXTRACTED-SPEC.md`](./_prototype/EXTRACTED-SPEC.md).
Every documented bug fix in §11 has a regression test under `tests/parser/`.

## Security & compliance

See [`SECURITY_AUDIT_REPORT.md`](./SECURITY_AUDIT_REPORT.md) for the Slice 1
security posture: auth model, RLS, Storage policies, audit trail, CSP, and
known limitations.

## License

Internal — not for redistribution.

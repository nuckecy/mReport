# mReport

Parish report extractor and validator.

mReport ingests monthly parish report Excel files, validates them against canonical
remittance rules, and persists structured records to a Postgres backend with
authentication, authorization, and audit.

## Status

**Slice 1 — Day 0 complete.** The Next.js project is scaffolded with the design
tokens, primitive Button, security headers, lib skeleton, Vitest + Playwright,
the initial Supabase migration, and CI. The submission flow + auth + admin pages
are built across Days 1–10.

The single-file HTML prototype that informed this build lives in
[`_prototype/`](./_prototype/) — it is frozen as the reference implementation
and the [extracted spec](./_prototype/EXTRACTED-SPEC.md) is the source of truth
for v2.

## Stack

- **Next.js 16** (App Router) + **TypeScript strict**
- **Tailwind CSS v4** + design tokens (Cal.com-inspired) + **shadcn-style primitives**
- **Inter** font, **Lucide** icons
- **Supabase** (Postgres + Auth + Storage + RLS) — EU region
- **TanStack Query** for server state, **React Context** for global UI state
- **Zod** for schema validation
- **Vitest** + **React Testing Library** + **Playwright** for tests
- **Vercel** for hosting + preview deployments

## Local development

```bash
# install deps
pnpm install

# copy env template, fill in real values
cp .env.example .env.local

# dev server (http://localhost:3000)
pnpm dev

# run unit tests
pnpm test

# run E2E (boots dev server automatically)
pnpm test:e2e

# typecheck without emitting
pnpm typecheck

# format check (CI runs this)
pnpm format:check
```

## Project layout

```
src/
├── app/                 # Next.js routes (App Router)
│   ├── layout.tsx       # root shell — Inter font, Providers, dark theme
│   ├── page.tsx         # landing — Log in / Upload buttons
│   └── globals.css      # design tokens + Tailwind base
├── components/
│   ├── providers.tsx    # TanStack Query
│   └── ui/              # primitive components (Button, ...)
├── lib/
│   ├── format.ts        # fmt / fmtCount / fmtSmart helpers
│   ├── parser/          # xlsx parser (port from prototype, Day 4)
│   ├── validation/      # canonical rules + classifier (Day 4)
│   ├── supabase/        # browser + server clients
│   └── utils.ts         # cn() helper
supabase/
├── migrations/
│   └── 0001_init.sql    # q7m2_ schema with RLS enabled
tests/
├── setup.ts             # vitest setup (jest-dom)
├── format.test.ts       # smoke unit test
└── e2e/landing.spec.ts  # Playwright smoke
_prototype/
├── index.html           # frozen prototype
├── README.md
└── EXTRACTED-SPEC.md    # source of truth for the rebuild
```

## Source of truth

When in doubt about parser behavior, validation rules, formatting, or any UX
decision, reference [`_prototype/EXTRACTED-SPEC.md`](./_prototype/EXTRACTED-SPEC.md).
Anything the prototype handled correctly must work in v2; deviations should be
intentional and documented.

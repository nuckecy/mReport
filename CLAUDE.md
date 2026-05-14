@AGENTS.md

# mReport — context for Claude Code sessions

You are working on **mReport**, an Excel-driven parish-report extractor and validator.
It is being rebuilt as a proper Next.js app, replacing a single-file HTML prototype.
mReport is **one app inside a larger multi-tenant platform** — it is not standalone.

## Read first, every session

Before writing or modifying anything, read these in order:

1. **`docs/PROGRESS.md`** — what slice we're in, what's done, what's blocked, what's next.
   This is the source of truth for "where we are." Update it as you work.
2. **`docs/ARCHITECTURE.md`** — the architectural decisions and their reasons.
   If you're about to make a load-bearing decision and ARCHITECTURE.md doesn't
   cover it, that's a signal to ask the user, then write it down.
3. **`docs/PLATFORM-INTEGRATION.md`** — how mReport plugs into the platform's
   `core_*` tables, auth, tenant resolution, and role hierarchy.
4. **`docs/platform-schema.md`** — read-only mirror of the platform's `core_*`
   schema. mReport conforms to it; we do not modify these tables.
5. **`_prototype/EXTRACTED-SPEC.md`** — every parser rule, regex, threshold, and
   bug fix from the prototype. The rebuild's source of truth for behavior.

The single-file prototype itself lives at `_prototype/index.html` (frozen).
Drag into a browser to use it as a working reference.

## Reference implementation

The app called **`event-calendar`** at
`/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/` is the existing
reference for how a platform app is structured. When in doubt about auth,
middleware, session helpers, role checks, or migration patterns, **look there
first** before inventing your own pattern. Notably:

- `event-calendar/middleware.ts` — tenant resolution
- `event-calendar/lib/auth/session.ts` — `getSession({ appSlug })` pattern
- `event-calendar/lib/auth/access.ts` — role + access check chain
- `event-calendar/db/schema/core.ts` — Drizzle definitions for `core_*` tables
- `event-calendar/drizzle/` — platform migrations

mReport mirrors event-calendar's patterns. Inventing a parallel pattern is a
maintainability tax — match what's there unless there's a written reason not to.

## Stack snapshot

- Next.js 16 (App Router), TypeScript strict mode (incl. noUncheckedIndexedAccess)
- Tailwind v4 + design tokens in `src/app/globals.css` (Cal.com-inspired, dark-first)
- shadcn-style primitives in `src/components/ui/` (Button is the first; build more as needed)
- Inter font, Lucide icons
- Supabase (shared with platform — same project, same DB, separate `mreport_*` tables)
- Auth: **Supabase Auth backend + custom platform layer** (Hybrid). Login UI calls
  Supabase Auth APIs; tenant + role resolution happens in middleware/server actions
  that read `core_*` tables. mReport never touches `core_users.password_hash`.
- TanStack Query for server state, React Context for global UI state
- Zod for input validation
- Vitest + Playwright for tests
- Vercel for hosting

## Commands

```bash
pnpm dev          # http://localhost:3000
pnpm test         # vitest unit tests
pnpm test:e2e     # Playwright (boots dev server)
pnpm typecheck    # tsc --noEmit
pnpm lint         # ESLint
pnpm format       # Prettier write
pnpm format:check # Prettier verify
pnpm build        # Next.js production build
```

## House rules (mReport-specific, on top of system instructions)

- **No new architecture without docs.** If you're inventing a pattern, add it to
  `docs/ARCHITECTURE.md` first or update an existing entry. Future sessions need
  to find your reasoning, not just your code.
- **Update `docs/PROGRESS.md` as work progresses.** When you complete a step,
  mark it done. When you hit a blocker, add it. The file is the cross-session
  todo list.
- **Match the platform's table prefix convention.** mReport tables are
  `mreport_*`. Don't introduce other prefixes.
- **`tenant_id` on every row.** No exceptions for tenant-scoped tables. RLS
  policies join through `core_tenant_user_roles` for permission checks.
- **`timestamptz`, not `timestamp`.** Documented deviation from platform; reasons
  in `ARCHITECTURE.md`.
- **Don't touch `core_*` schema.** Read-only from mReport's perspective.
  Schema changes there require platform-team coordination.
- **Don't reintroduce single-file architecture.** No giant `index.html`, no
  inline `<script>` blocks, no manual DOM manipulation. Components, types,
  modules.
- **The prototype is frozen.** Don't touch `_prototype/index.html` or
  `_prototype/EXTRACTED-SPEC.md`. Update the doc only if you find a real spec
  error against the prototype source.

## Source of truth, when in doubt

| Question | Where to look |
|---|---|
| What's the current state of the build? | `docs/PROGRESS.md` |
| Why did we choose X? | `docs/ARCHITECTURE.md` |
| How does mReport plug into the platform? | `docs/PLATFORM-INTEGRATION.md` |
| What does the platform schema look like? | `docs/platform-schema.md` |
| How does the parser handle X edge case? | `_prototype/EXTRACTED-SPEC.md` |
| How does event-calendar do X? | `/Users/otobong.okoko/Sandbox-Vibe/vibecoding/event-calendar/` |

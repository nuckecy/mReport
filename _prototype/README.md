# mReport prototype (archived)

This folder contains the original single-file HTML prototype that was used to design
and validate the mReport workflow. It is **frozen** — no further changes go here.

The prototype was the iteration ground for:
- The xlsx parsing strategy (label-tolerant lookups, template-validity detection)
- The validation rules (canonical percentages, statistics totals, sanity checks)
- The UX patterns (compact summary, failure cards, auto-fix flow, in-session log,
  template warning, error showcase)
- The end-to-end submission workflow design

The production application is being rebuilt as a proper Next.js project at the
repository root. This file is kept only as a reference and to honour the design
work that informed the new build.

To open: drag `index.html` into a browser. It is fully self-contained — no build
step, no server. All logic runs client-side via `xlsx` and `lucide` from CDN.

Frozen on: 2026-05-14

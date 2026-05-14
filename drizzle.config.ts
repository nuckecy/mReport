import type { Config } from "drizzle-kit";

/**
 * Drizzle config — used by drizzle-kit for generating migrations and
 * introspecting the live database.
 *
 * IMPORTANT: We do NOT use drizzle-kit to generate migrations against the
 * platform DB. The platform's `core_*` tables are owned by event-calendar
 * (and any future platform-management tool); we only READ them from
 * mReport. Our own migrations live in `supabase/migrations/` as hand-
 * written SQL files (matching event-calendar's drizzle/ pattern) and are
 * applied via `psql` per the workflow in PROGRESS.md.
 *
 * This config exists primarily so:
 *   - drizzle-kit can introspect schemas for type generation
 *   - we have a single place to point at the DB if we ever do generate
 *     migrations for mreport_* tables (not in Slice 1)
 */
export default {
  schema: "./src/lib/db/schema/index.ts",
  out: "./supabase/migrations/_drizzle-generated",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
} satisfies Config;

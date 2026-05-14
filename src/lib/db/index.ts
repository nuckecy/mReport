// Drizzle client — Supabase Postgres via the postgres-js driver.
//
// Mirrors event-calendar/db/index.ts so the two apps share the same
// connection pattern. See docs/PLATFORM-INTEGRATION.md.
//
// SECURITY:
// - Connection string read from env (never hardcoded).
// - SSL required for any non-localhost host. Supabase always serves over
//   TLS, so we set ssl: "require".
// - `prepare: false` is needed when running through Supabase's transaction
//   pooler (port 6543); harmless on direct connections (port 5432).
//
// HOT RELOAD:
// - Next.js's dev server hot-reloads modules, which would create a new
//   client every reload. The `global.__mreport_pg_client` guard reuses a
//   single client. (event-calendar uses __cem_pg_client; we use a
//   different global key so the two apps don't collide if ever loaded
//   in the same process during testing.)

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

function shouldRequireSsl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
    return !localHosts.has(parsed.hostname);
  } catch {
    return true;
  }
}

declare global {
  var __mreport_pg_client: ReturnType<typeof postgres> | undefined;
}

const client =
  global.__mreport_pg_client ??
  postgres(connectionString, {
    ssl: shouldRequireSsl(connectionString) ? "require" : false,
    max: 10,
    idle_timeout: 30,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  global.__mreport_pg_client = client;
}

export const db = drizzle(client, { schema });

// Re-export for convenience.
export { schema };
export type Database = typeof db;

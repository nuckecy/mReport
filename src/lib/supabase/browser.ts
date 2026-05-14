// Supabase browser client factory.
//
// Use this in:
//   - Client Components ("use client" files)
//
// The client uses `document.cookie` for session persistence. By default
// `createBrowserClient` enforces a singleton, so calling this multiple
// times returns the same instance.
//
// SECURITY:
// - Anon key is exposed to the browser bundle. That's by design for
//   Supabase clients — RLS policies are what actually protect data.
// - Never use this client to make authorization decisions. Auth checks
//   belong server-side (use lib/auth/access.ts or the server Supabase
//   client + getUser()).

"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

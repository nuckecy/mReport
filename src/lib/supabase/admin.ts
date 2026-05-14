// Supabase admin client — SERVER ONLY.
//
// This client uses the SERVICE_ROLE key, which bypasses RLS entirely. It
// must NEVER be imported from a client component. Callers should already
// have gated the request via `requireAdmin` (server-side role check) before
// touching this client.
//
// Use cases (Day 6+):
//   - Creating Supabase Auth users on invite (createUser / inviteUserByEmail)
//   - Listing auth.users for the admin members table
//   - Any administrative action that legitimately needs to skip RLS
//
// Why a separate client: `createSupabaseServerClient` uses the public ANON
// key + the user's session cookie; it correctly respects RLS so it's the
// right choice for user-facing actions. The service-role client is the
// admin equivalent — power tool, audit log everything you do with it.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function createSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (server-only) is not set. Required for admin actions.",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

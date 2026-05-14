/**
 * Browser-side Supabase client. Created on demand and cached per session.
 *
 * Real auth wiring lands Day 3. For now this just establishes the import path
 * so other code can reference `getSupabaseBrowserClient()` without each file
 * needing to know how the client is constructed.
 */

import { createBrowserClient } from "@supabase/ssr";

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }
  cached = createBrowserClient(url, anonKey);
  return cached;
}

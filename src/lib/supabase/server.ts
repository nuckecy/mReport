// Supabase server client factory.
//
// Use this in:
//   - Server Components (app/**/page.tsx, layout.tsx)
//   - Route Handlers (app/**/route.ts)
//   - Server Actions
//
// The client reads + writes session cookies through Next.js's `cookies()`
// API so the user's session persists across requests.
//
// SECURITY:
// - Always call `supabase.auth.getUser()` for AUTHORIZATION decisions —
//   never `getSession()`. `getUser()` re-validates the JWT against the
//   Supabase Auth server; `getSession()` only decodes the cookie, which
//   is signed but the user object inside it can be stale.
// - This client uses the public ANON key. RLS policies on the database
//   constrain what the authenticated user can read/write.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Setting cookies from a Server Component throws — Next.js
          // forbids cookie writes from RSC render. We swallow that
          // specific error: the middleware will re-set the cookies on
          // the next request (the Supabase SSR refresh flow), and
          // Server Actions / Route Handlers don't hit this path.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component context — safe to ignore.
          }
        },
      },
    },
  );
}

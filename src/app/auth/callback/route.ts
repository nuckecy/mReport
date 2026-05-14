// /auth/callback — magic-link landing.
//
// The user clicked the link in their email. Supabase appended a one-time
// `code` query param; we exchange it for a real session and then bounce
// them to their intended destination.
//
// SECURITY
// - We use `exchangeCodeForSession` (the SSR-safe variant) which sets
//   the auth cookies via our `createSupabaseServerClient`'s cookie adapter.
// - If the code is missing, expired, or invalid we redirect back to
//   /login with an `?e=` indicator instead of leaking the error.
// - The `next` query param is sanitized by `safeNextPath` to prevent
//   open-redirect attacks (//evil.com, /\evil.com, javascript:..., etc.).

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirect-safety";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  // Origin reconstruction: we trust the request's own origin here (rather
  // than env vars) because this route is always hit on the tenant
  // subdomain the user is signing in to, and that's where we want them to
  // end up. Using a fixed env var would break multi-tenant routing.
  const origin = `${url.protocol}//${url.host}`;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?e=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Supabase returns specific error messages on token-expired vs
    // token-invalid; we collapse them to a single `expired` indicator
    // because the user-visible recovery is the same (request a new link).
    const isExpired =
      error.message?.toLowerCase().includes("expired") ||
      error.status === 410 ||
      error.status === 401;
    return NextResponse.redirect(`${origin}/login?e=${isExpired ? "expired" : "invalid"}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

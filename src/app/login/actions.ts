"use server";

// Login server actions.
//
// Auth model: MAGIC LINK ONLY (matches event-calendar's pattern).
//   1. User submits email → we call supabase.auth.signInWithOtp({ email,
//      options: { emailRedirectTo, shouldCreateUser: false } }).
//   2. Supabase emails the user a one-tap link to /auth/callback?code=...
//   3. /auth/callback exchanges the code for a session and redirects.
//
// We do NOT support 6-digit code entry. The link in the email IS the second
// factor. Reasoning: matches event-calendar (operational parity), and avoids
// the UX of typing a code on a phone.
//
// SECURITY
// - `shouldCreateUser: false` means /login cannot enroll random emails. Users
//   must be provisioned via the platform admin (core_users + core_tenant_users
//   + core_tenant_user_roles) BEFORE they can sign in. This is a hard
//   boundary; do not relax it.
// - We return the SAME generic "Check your email" message regardless of
//   whether the email is approved or not, to avoid leaking which addresses
//   are valid users. The 429 rate-limit response IS surfaced (we'd rather
//   tell the user to wait than have them refresh-spam).
// - `next` param is validated by `safeNextPath` to prevent open redirects.

import { z } from "zod";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirect-safety";

export type LoginActionState =
  | { status: "idle" }
  | { status: "sent"; email: string; next?: string }
  | { status: "error"; message: string };

const EmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  // formData.get returns null when the hidden input is missing; Zod 4
  // distinguishes null from undefined, so accept both.
  next: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
});

/**
 * Send the magic-link email. Returns a state object the client uses to swap
 * the form to the "Check your email" view (or display an error).
 */
export async function signInWithMagicLinkAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = EmailSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      status: "error",
      message: first?.message ?? "Enter a valid email address.",
    };
  }

  const { email, next: rawNext } = parsed.data;
  const next = safeNextPath(rawNext);

  // Build the absolute callback URL from the incoming request's host so the
  // magic link lands on the SAME tenant subdomain the user is signing in
  // from. We can't use NEXT_PUBLIC_SITE_URL — it doesn't know the tenant.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  if (!host) {
    return {
      status: "error",
      message: "We couldn't determine the workspace. Try again from the workspace URL.",
    };
  }
  const callbackUrl = `${protocol}://${host}/auth/callback?next=${encodeURIComponent(next)}`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl,
      // Hard requirement: users must be pre-provisioned. /login is NOT a
      // sign-up surface — see security note at top of file.
      shouldCreateUser: false,
    },
  });

  if (error) {
    // Rate limiting from Supabase is the one case we surface — telling the
    // user to wait is more useful than the generic "check your email".
    if (error.status === 429) {
      return {
        status: "error",
        message: "Too many attempts. Wait a minute and try again.",
      };
    }
    // For every other failure path we show the SAME generic success message
    // to avoid leaking which emails are provisioned. The /auth/callback
    // route is the actual gate — invalid emails simply never get a working
    // link.
  }

  return { status: "sent", email, next };
}

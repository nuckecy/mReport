"use server";

// Server actions that any auth surface in the app can call.
// Kept thin: business logic stays in the page-local actions; this file is
// only for actions that are reused across surfaces (sign-out is the canonical
// example — invoked from /no-access today and from a future user menu).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sign the user out of Supabase and bounce them back to /login.
 *
 * Used as a <form action={signOutAction}> target so it works without JS.
 * After Supabase clears the session cookies, we revalidate `/` to drop any
 * RSC cache that was personalized for the now-signed-out user, then redirect.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

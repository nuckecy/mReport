import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readTenantContextFromHeaders } from "@/lib/tenant";
import { LoginForm } from "./LoginForm";
import { safeNextPath } from "@/lib/auth/redirect-safety";

/**
 * /login — magic-link sign-in.
 *
 * Behavior:
 *   - If the user is already signed in, bounce to `next` (sanitized) so we
 *     don't show a "sign in" UI to someone who is already authenticated.
 *   - Otherwise render the email form. After submission, the form swaps to
 *     a "check your email" confirmation in-place (no navigation).
 *
 * Tenant context: the middleware sets `x-tenant-id` / `x-tenant-slug`
 * headers from the subdomain. If those are missing (bare platform domain),
 * we still render — but the magic-link callback URL we build won't route
 * anywhere useful. Future improvement: detect this and show a workspace
 * picker instead. For Slice 1, treat it as a non-tenant fallback.
 */

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  const callbackError = firstParam(params.e);

  // If the user is already signed in, send them to `next`. We don't gate
  // on tenant context here — `requireAuth` does that on the destination.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(next);
  }

  // Read tenant context purely so we can show the tenant name on the page.
  // Authorization is not enforced here (this IS the sign-in page).
  const requestHeaders = await headers();
  const tenant = readTenantContextFromHeaders(requestHeaders);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <Link href="/" className="text-text inline-block text-sm font-semibold tracking-tight">
          mReport
        </Link>
        {tenant ? (
          <p className="text-text-muted mt-1 text-xs">
            Signing in to{" "}
            <span className="text-text font-medium">{tenant.tenantSlug}.churchplatform.com</span>
          </p>
        ) : (
          <p className="text-text-muted mt-1 text-xs">Choose a workspace to continue.</p>
        )}
      </div>

      <Card className="w-full">
        <CardContent className="p-8">
          <div className="mb-6 flex flex-col gap-2">
            <h1 className="text-text text-2xl font-semibold tracking-tight">Sign in to mReport</h1>
            <p className="text-text-muted text-sm">
              Enter your work email and we&rsquo;ll send you a one-tap sign-in link.
            </p>
          </div>

          <LoginForm next={next} callbackError={callbackError} />
        </CardContent>
      </Card>

      <p className="text-text-subtle mt-8 text-center text-xs">
        Secured by Supabase Auth · need help? Ask your tenant admin.
      </p>
    </main>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

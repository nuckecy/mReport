import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { signOutAction } from "@/lib/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { readTenantContextFromHeaders } from "@/lib/tenant";
import { checkAccess } from "@/lib/auth/access";

/**
 * /no-access — shown to authenticated users who lack a role for mReport
 * in the current tenant.
 *
 * Behavior:
 *   - If the user isn't signed in at all → bounce to /login (this page
 *     would be confusing without a session).
 *   - If the user IS signed in AND has a role → bounce them to /
 *     (something else is misconfigured; don't show a misleading error).
 *   - Otherwise render the friendly "you're signed in but lack access"
 *     view.
 *
 * Friendly-not-punishing per design brief: no red/error treatment.
 */
export default async function NoAccessPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const requestHeaders = await headers();
  const tenant = readTenantContextFromHeaders(requestHeaders);

  // If for some reason the user actually DOES have access, don't trap them
  // here. The route they originally requested might have changed since the
  // /no-access redirect was issued.
  if (tenant) {
    const access = await checkAccess(user.id, tenant.tenantSlug, "mreport");
    if (access.allowed) {
      redirect("/");
    }
  }

  const email = user.email ?? "";
  const displayName =
    (user.user_metadata?.name as string | undefined) ?? email.split("@")[0] ?? "there";
  const initial = (displayName[0] ?? "?").toUpperCase();
  const tenantName = tenant?.tenantSlug ?? "this workspace";

  const mailtoSubject = encodeURIComponent("mReport access request");
  const mailtoBody = encodeURIComponent(
    `Hi — please grant me access to mReport on ${tenantName}. My account: ${email}.`,
  );
  const mailtoHref = `mailto:?subject=${mailtoSubject}&body=${mailtoBody}`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <Link href="/" className="text-text inline-block text-sm font-semibold tracking-tight">
          mReport
        </Link>
        {tenant ? (
          <p className="text-text-muted mt-1 text-xs">
            <span className="text-text font-medium">{tenant.tenantSlug}.churchplatform.com</span>
          </p>
        ) : null}
      </div>

      <Card className="w-full">
        <CardContent className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <div
              className="bg-panel-2 text-accent grid size-10 place-items-center rounded-full text-sm font-semibold"
              aria-hidden="true"
            >
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-text truncate text-sm font-medium">{displayName}</p>
              <p className="text-text-muted truncate text-xs">{email}</p>
            </div>
          </div>

          <span className="bg-info-bg text-info mb-4 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium">
            <ShieldCheck className="size-3" aria-hidden="true" />
            Signed in
          </span>

          <h1 className="text-text mb-2 text-2xl font-semibold tracking-tight">
            No mReport access yet
          </h1>
          <p className="text-text-muted text-sm leading-relaxed">
            Your account is active on <span className="text-text font-medium">{tenantName}</span>,
            but you haven&rsquo;t been assigned a role in mReport yet. Ask your tenant admin to add
            you so you can start submitting reports.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <a href={mailtoHref}>
              <Button variant="primary" size="lg" className="w-full">
                <Mail className="size-4" aria-hidden="true" />
                Contact admin
              </Button>
            </a>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="lg" className="w-full">
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <p className="text-text-subtle mt-6 text-center text-xs">
        Wrong account?{" "}
        <Link href="/login" className="text-text-muted hover:text-text underline-offset-4">
          Sign in as someone else
        </Link>
      </p>
    </main>
  );
}

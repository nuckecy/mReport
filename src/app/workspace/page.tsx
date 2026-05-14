import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { readTenantContextFromHeaders } from "@/lib/tenant";
import { WorkspacePickerForm } from "./WorkspacePickerForm";

/**
 * Workspace picker — shown when the user lands on the platform domain
 * (or bare localhost in dev) and we don't know which tenant they want
 * to act on.
 *
 * If we DO have a tenant context (i.e. the user reached this page via
 * a tenant subdomain), we bounce to the landing page on that subdomain —
 * the picker has nothing to add there.
 */
export default async function WorkspacePickerPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const requestHeaders = await headers();
  const tenant = readTenantContextFromHeaders(requestHeaders);
  if (tenant) {
    redirect("/");
  }

  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <Link href="/" className="text-text inline-block text-sm font-semibold tracking-tight">
          mReport
        </Link>
        <p className="text-text-muted mt-1 text-xs">Pick a workspace to continue.</p>
      </div>

      <Card className="w-full">
        <CardContent className="p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="bg-panel-2 grid size-10 place-items-center rounded-[var(--radius-md)]">
              <Building2 className="text-text-muted size-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-text text-2xl font-semibold tracking-tight">Which workspace?</h1>
              <p className="text-text-muted mt-1 text-sm">
                Enter the workspace name your admin gave you.
              </p>
            </div>
          </div>

          <WorkspacePickerForm next={next} />
        </CardContent>
      </Card>

      <p className="text-text-subtle mt-8 text-center text-xs">
        Don&rsquo;t know your workspace? Ask your tenant admin.
      </p>
    </main>
  );
}

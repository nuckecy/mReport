import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { signOutAction } from "@/lib/auth/actions";
import { requireAuth } from "@/lib/auth/session";
import { UploadDropzone } from "./UploadDropzone";

/**
 * /upload — primary preparer surface for Slice 1.
 *
 * Auth-gated by `requireAuth` (redirects to /login or /no-access). Parsing
 * happens client-side via SheetJS — the actual .xlsx never leaves the user's
 * machine until Day 5 (submit flow). This page only validates and shows the
 * preparer what would be saved.
 *
 * Mismatch check: when the user has a parish scope (preparer / parish_admin),
 * we pass their authorized parish name to the client so the dropzone can
 * flag uploads from a different parish before the user wastes time submitting.
 */
export default async function UploadPage() {
  const session = await requireAuth({ next: "/upload" });

  // Display name for the page header — name from core_users, fallback to email.
  const displayName = session.name ?? session.email ?? "there";
  // The scope.parishName is null for super_admin / platform_admin (they can
  // upload on behalf of any parish), populated for everyone else.
  const authorizedParish = session.scope?.parishName ?? null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-text-muted hover:text-text inline-block text-xs font-semibold tracking-tight"
          >
            mReport
          </Link>
          <h1 className="text-text mt-1 text-2xl font-semibold tracking-tight">Upload report</h1>
          <p className="text-text-muted mt-1 text-sm">
            Drag a parish .xlsx file here to validate it against the canonical rules.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-text-muted hidden text-xs sm:inline">{displayName}</span>
          <ThemeToggle />
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="size-4" aria-hidden="true" />
              <span className="sr-only">Sign out</span>
            </Button>
          </form>
        </div>
      </header>

      <UploadDropzone
        authorizedParish={authorizedParish}
        userRole={session.role}
        tenantSlug={session.tenantSlug}
      />

      <p className="text-text-subtle mt-8 text-xs">
        Files are parsed in your browser. Nothing is sent to the server until you submit.
      </p>
    </main>
  );
}

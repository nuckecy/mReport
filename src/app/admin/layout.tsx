import Link from "next/link";
import { FileSpreadsheet, Globe, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { signOutAction } from "@/lib/auth/actions";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * Admin shell. Every `/admin/*` page mounts under this layout.
 *
 * `requireAdmin()` runs once at the layout level — sub-pages reusing it
 * pays for an extra Supabase round-trip per render, so we trust this
 * layout's check and call `getSession()` (not requireAdmin) downstream
 * if we just need session data.
 *
 * The nav is intentionally minimal for Day 6 (only Members). Reports
 * admin gets added in Day 7.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const displayName = session.name ?? session.email ?? "Admin";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-text-muted hover:text-text inline-block text-xs font-semibold tracking-tight"
          >
            mReport
          </Link>
          <h1 className="text-text mt-1 text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-text-muted mt-1 text-sm">{session.tenantSlug}.churchplatform.com</p>
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

      <nav className="border-border mb-6 flex gap-1 border-b">
        <Link
          href="/admin/reports"
          className="text-text-muted hover:text-text border-b-2 border-transparent px-3 pb-2 text-sm font-medium"
        >
          <FileSpreadsheet className="mr-1.5 inline size-4" aria-hidden="true" />
          Reports
        </Link>
        <Link
          href="/admin/region"
          className="text-text-muted hover:text-text border-b-2 border-transparent px-3 pb-2 text-sm font-medium"
        >
          <Globe className="mr-1.5 inline size-4" aria-hidden="true" />
          Region rollup
        </Link>
        <Link
          href="/admin/members"
          className="text-text-muted hover:text-text border-b-2 border-transparent px-3 pb-2 text-sm font-medium"
        >
          <Users className="mr-1.5 inline size-4" aria-hidden="true" />
          Members
        </Link>
      </nav>

      {children}
    </div>
  );
}

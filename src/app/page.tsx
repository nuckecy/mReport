import Link from "next/link";
import { LogIn, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Landing page. Two equal-weight entry points per the Slice 1 plan:
 *   - "Upload report" → upload-first; identity is verified after parsing
 *   - "Log in" → identity-first for returning users
 *
 * Both flows are stubs at this stage — wired up across Days 2-5 of Slice 1.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="mb-10 text-center">
        <h1 className="text-text text-4xl font-semibold tracking-tight">mReport</h1>
        <p className="text-text-muted mt-3 text-base">
          Submit, validate, and review parish monthly reports.
        </p>
      </div>

      <div className="bg-panel border-border w-full rounded-[var(--radius-lg)] border p-8 shadow-md">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/upload" className="contents">
            <Button size="lg" variant="primary" className="h-12 w-full">
              <Upload className="size-4" />
              Upload report
            </Button>
          </Link>
          <Link href="/login" className="contents">
            <Button size="lg" variant="outline" className="h-12 w-full">
              <LogIn className="size-4" />
              Log in
            </Button>
          </Link>
        </div>
        <p className="text-text-subtle mt-6 text-center text-xs">
          Both flows are stubs — wired up in the upcoming auth + upload work.
        </p>
      </div>
    </main>
  );
}

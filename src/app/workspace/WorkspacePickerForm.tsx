"use client";

// Workspace-picker form. The slug input has an inline `.churchplatform.com`
// suffix so the user can see exactly which host they're about to land on.
//
// On success the action returns `{ status: "redirect", url: "..." }`
// and we redirect the browser. We use `window.location.assign` rather
// than `router.push` because we're crossing subdomains (host change)
// and Next.js's client router can't soft-navigate across hosts.

import { useActionState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupWorkspaceAction, type LookupWorkspaceState } from "./actions";

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "churchplatform.com";

const initialState: LookupWorkspaceState = { status: "idle" };

export interface WorkspacePickerFormProps {
  next?: string;
}

export function WorkspacePickerForm({ next }: WorkspacePickerFormProps) {
  const [state, formAction, pending] = useActionState(lookupWorkspaceAction, initialState);

  // When the server returns a redirect URL, hop to it. We can't do this
  // server-side because we're crossing hosts (subdomain change) and
  // Next.js's `redirect()` doesn't render a friendly transition for
  // cross-host nav.
  useEffect(() => {
    if (state.status === "redirect") {
      window.location.assign(state.url);
    }
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="workspace-slug">Workspace</Label>
        <div className="flex">
          <Input
            id="workspace-slug"
            name="slug"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoFocus
            required
            placeholder="demo"
            aria-invalid={state.status === "error"}
            className="rounded-r-none border-r-0"
          />
          <span className="border-border bg-panel-2 text-text-subtle inline-flex items-center rounded-r-[var(--radius-md)] border px-3 text-sm">
            .{PLATFORM_DOMAIN}
          </span>
        </div>
      </div>

      {state.status === "error" ? (
        <p role="alert" className="text-bad -mt-1 text-xs">
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={pending || state.status === "redirect"}
      >
        {pending ? "Looking up…" : state.status === "redirect" ? "Redirecting…" : "Continue"}
        {!pending && state.status !== "redirect" ? (
          <ArrowRight className="size-4" aria-hidden />
        ) : null}
      </Button>
    </form>
  );
}

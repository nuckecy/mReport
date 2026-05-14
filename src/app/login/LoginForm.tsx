"use client";

// Login form (client component).
//
// Single magic-link flow. The form starts in `idle` state with an email
// input; after a successful submission it swaps to `sent` state showing
// "Check your email" — no further interaction here. The user clicks the
// link in the email, which lands on /auth/callback.
//
// Uses React 19's `useActionState` for form-pending state (no manual
// useState for `loading`). The action is a server action defined in
// ./actions.ts so the email never touches client-side fetch logic.

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithMagicLinkAction, type LoginActionState } from "./actions";

const initialState: LoginActionState = { status: "idle" };

type LoginFormProps = {
  next: string;
  callbackError?: string;
};

export function LoginForm({ next, callbackError }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(signInWithMagicLinkAction, initialState);

  // When we transition from `idle`/`error` → `sent`, move focus to the
  // confirmation heading so screen readers announce the new content.
  const confirmRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state.status === "sent" && confirmRef.current) {
      confirmRef.current.focus();
    }
  }, [state.status]);

  if (state.status === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <h2
          ref={confirmRef}
          tabIndex={-1}
          className="text-text text-2xl font-semibold tracking-tight outline-none"
        >
          Check your email
        </h2>
        <p className="text-text-muted text-sm" role="status" aria-live="polite">
          We sent a sign-in link to <span className="text-text font-medium">{state.email}</span>.
          Open it on this device to continue.
        </p>
        <p className="text-text-subtle text-xs">
          The link is good for 15 minutes. You can close this tab — the link will sign you in
          wherever you open it.
        </p>
        <form className="mt-2">
          {/* `formAction` re-running with the prior state lets the user resend
              by submitting the same form. We render this as a "send to a
              different address" affordance instead — simpler model. */}
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="text-text-muted hover:text-text inline-flex items-center gap-1.5 text-xs"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Use a different email
          </Link>
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          required
          placeholder="you@parish.org"
          aria-describedby="email-help"
          aria-invalid={state.status === "error"}
        />
      </div>

      {state.status === "error" ? (
        <p role="alert" className="text-bad -mt-1 text-xs">
          {state.message}
        </p>
      ) : null}

      {callbackError ? (
        <p role="alert" className="bg-bad-bg text-bad rounded-[var(--radius-md)] px-3 py-2 text-xs">
          {humanizeCallbackError(callbackError)}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          "Sending…"
        ) : (
          <>
            <Mail className="size-4" aria-hidden="true" />
            Send sign-in link
          </>
        )}
      </Button>

      <p id="email-help" className="text-text-subtle text-center text-xs">
        We&rsquo;ll email you a one-tap sign-in link. No password needed.
      </p>
    </form>
  );
}

function humanizeCallbackError(code: string): string {
  switch (code) {
    case "expired":
      return "Your sign-in link expired. Request a new one below.";
    case "invalid":
      return "We couldn't verify that link. Request a new one below.";
    case "no_role":
      return "You don't have access to mReport on this workspace.";
    default:
      return "Something went wrong with the previous sign-in attempt. Try again.";
  }
}

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Text input primitive. Reads from design tokens; no hardcoded colors.
 * Used by the login flow (email + code), admin forms, and anywhere we
 * need a text field.
 *
 * Pairs with `<Label>` for accessibility.
 */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, type = "text", ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "border-border bg-panel text-text placeholder:text-text-subtle focus-visible:border-accent aria-invalid:border-bad flex h-10 w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

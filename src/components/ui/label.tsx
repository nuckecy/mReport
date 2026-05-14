import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Label primitive — accessible form labelling. Use `htmlFor` to bind to
 * an Input. Token-driven; muted text by default.
 */
export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      className={cn(
        "text-text-muted text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
});

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button — design-system primitive. Variants and sizes are token-driven so the
 * entire button family inherits any theme change made in globals.css.
 *
 * Usage:
 *   <Button variant="primary">Click</Button>
 *   <Button variant="ghost" size="sm">Cancel</Button>
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium select-none transition-[transform,opacity,background-color,border-color] disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px focus-visible:outline-2 focus-visible:outline-accent",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent-strong",
        secondary: "bg-panel-2 text-text hover:bg-border",
        outline: "border border-border-strong text-text hover:bg-panel",
        ghost: "text-text hover:bg-panel",
        danger: "bg-bad text-bad-fg hover:opacity-90",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-sm rounded-[var(--radius-sm)]",
        md: "h-10 px-4 text-sm rounded-[var(--radius-md)]",
        lg: "h-11 px-5 text-base rounded-[var(--radius-md)]",
        icon: "h-10 w-10 rounded-[var(--radius-md)]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...rest} />
  );
});

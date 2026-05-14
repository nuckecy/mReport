import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card — a token-driven panel container. Used to group related content,
 * present forms, and provide visual rhythm to a page.
 *
 * Subcomponents:
 *   <Card>         the panel itself (border + bg + radius)
 *   <CardHeader>   top section with title + optional description
 *   <CardTitle>    primary heading inside the header
 *   <CardDescription>  helper text below the title
 *   <CardContent>  body of the card
 *   <CardFooter>   footer aligned-end actions
 *
 * No hardcoded colors. Inherits the active theme through CSS variables.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-panel border-border rounded-[var(--radius-lg)] border shadow-md",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn("text-text text-xl font-semibold tracking-tight", className)} {...props} />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-text-muted text-sm", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-3 px-6 pb-6", className)} {...props} />;
}

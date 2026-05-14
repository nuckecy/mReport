import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class strings safely, deduping conflicts.
 *
 *   cn("p-4", isActive && "bg-accent", className)
 *
 * Standard shadcn/ui convention. Use it any time you need to combine class names
 * conditionally — especially in components that accept a `className` prop.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Open-redirect defense for any `?next=...` query param we honor.
//
// Lives in its own module (rather than inside a `"use server"` actions file)
// because Next 16 requires every export from a `"use server"` file to be an
// async function. This helper is pure and synchronous, so we keep it out of
// that boundary.

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return "/";
  }
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

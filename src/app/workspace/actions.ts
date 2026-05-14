"use server";

// Workspace-picker server actions.
//
// `lookupWorkspaceAction` validates a slug entered by the user on the
// bare-host landing page. It only reveals whether an ACTIVE tenant exists
// — no detail, no count, no error messages that would help enumerate
// valid workspaces.
//
// The picker is shown on bare hosts (no tenant context). Tenant-scoped
// requests bypass this entirely.

import { z } from "zod";
import { headers } from "next/headers";
import { lookupTenantBySlug } from "@/lib/tenant";
import { buildTenantHost } from "./host";

const LookupSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter a workspace name.")
    .max(63, "That workspace name looks too long.")
    // RFC 1035 hostname label, plus our convention that slugs are
    // alphanumeric + hyphen (no leading/trailing hyphen).
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i, "Use letters, digits, and hyphens only."),
  next: z.string().optional(),
});

export type LookupWorkspaceState =
  | { status: "idle" }
  | { status: "redirect"; url: string }
  | { status: "error"; message: string };

export async function lookupWorkspaceAction(
  _prev: LookupWorkspaceState,
  formData: FormData,
): Promise<LookupWorkspaceState> {
  const parsed = LookupSchema.safeParse({
    slug: formData.get("slug"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid workspace name.",
    };
  }

  const { slug } = parsed.data;
  const tenant = await lookupTenantBySlug(slug);
  if (!tenant) {
    // Generic message — don't reveal which slugs exist.
    return {
      status: "error",
      message: "We couldn't find that workspace. Check the name with your tenant admin.",
    };
  }

  // Build the destination URL on the matching subdomain.
  //
  // We honor a `next` path so a user who landed here from
  // `/upload?bare=1` can go straight to the right page after they pick
  // the workspace. The path is sanitized to start with "/" and reject
  // protocol-relative redirects (the same defense `safeNextPath` does).
  const next = safeNextPath(parsed.data.next);
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");

  // Compute the tenant host. In dev we sit on localhost; in prod we sit
  // on the platform domain. Either way, replace the host's leading bit
  // with `<slug>.`.
  const tenantHost = buildTenantHost(host, tenant.slug);
  const url = `${protocol}://${tenantHost}${next}`;

  return { status: "redirect", url };
}

// Inline duplicate of safeNextPath (the shared one is OK to import here,
// but keeping it inline avoids the cross-module surface for this small
// server action).
function safeNextPath(raw: string | null | undefined): string {
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

// Tenant resolution + Supabase session refresh middleware.
//
// Ported from event-calendar/middleware.ts. Functionally identical — same
// platform, same hostname strategy, same security guarantees. Anything
// different here would create a confusing inconsistency for tenants who
// use both apps.
//
// Runs on every non-static request and does two things:
//
//  1. Tenant resolution. Resolve the tenant from the request hostname
//     (custom domain first, then subdomain) and inject three headers
//     for downstream layouts and route handlers:
//
//       x-tenant-id     — UUID of the tenant
//       x-tenant-slug   — short slug (e.g. "newsong")
//       x-domain-type   — "subdomain" | "custom"
//
//  2. Supabase session refresh. Re-validate and rotate the Supabase
//     auth cookie. Required by `@supabase/ssr`: without this, access
//     tokens silently expire and users get logged out mid-flow.
//
// SECURITY:
// - Runs in Node.js runtime so we can use Drizzle + postgres-js for
//   tenant lookups and @supabase/ssr for session refresh. Edge runtime
//   can't open TCP sockets to Postgres.
// - Header sanitisation: strips any incoming `x-tenant-*` and
//   `x-domain-*` headers before processing, so a crafted request can
//   never spoof tenant identity.
// - No open redirects: only destinations are the platform domain
//   (constant) or a primary custom domain looked up from the DB.
// - Allowlisted reserved subdomains (`api`, `custom`, `www`) bypass
//   tenant resolution and pass through untouched.
// - Session refresh uses `getUser()` (re-validates against the Auth
//   server), not `getSession()` (which only decodes the cookie).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { lookupCustomDomain, lookupPrimaryDomain, lookupTenantBySlug } from "@/lib/tenant";

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "churchplatform.com";

// Hosts that should pass through untouched (no tenant resolution).
const PLATFORM_HOSTS = new Set<string>([PLATFORM_DOMAIN, `www.${PLATFORM_DOMAIN}`]);

// Subdomains under PLATFORM_DOMAIN that are reserved for platform use
// and must not be resolved as tenant slugs.
const RESERVED_SUBDOMAINS = new Set<string>(["custom", "api", "www"]);

// True when the request is the bare local dev host (no subdomain).
// `<slug>.localhost` is NOT covered here so we can resolve tenant
// subdomains in dev exactly like prod. The platform-host branch
// (no tenant context) only fires for bare localhost / 127.0.0.1.
function isLocalDev(hostname: string): boolean {
  const bareHost = hostname.split(":")[0]!;
  return (
    bareHost === "localhost" ||
    bareHost === "127.0.0.1" ||
    bareHost === "::1" ||
    bareHost === "lvh.me"
  );
}

// True when the request is a tenant subdomain in local dev,
// e.g. `demo.localhost:3000` or `demo.lvh.me:3000`.
function isLocalTenantSubdomain(hostname: string): {
  isLocal: boolean;
  subdomain: string | null;
} {
  const bareHost = hostname.split(":")[0]!;
  if (bareHost.endsWith(".localhost")) {
    return { isLocal: true, subdomain: bareHost.replace(/\.localhost$/, "") };
  }
  if (bareHost.endsWith(".lvh.me")) {
    return { isLocal: true, subdomain: bareHost.replace(/\.lvh\.me$/, "") };
  }
  return { isLocal: false, subdomain: null };
}

function stripTenantHeaders(headers: Headers): Headers {
  // Defense in depth: never let a client spoof the headers we inject.
  const cleaned = new Headers(headers);
  cleaned.delete("x-tenant-id");
  cleaned.delete("x-tenant-slug");
  cleaned.delete("x-domain-type");
  return cleaned;
}

// Refresh the Supabase session by reading + rewriting cookies on the
// passed `response`. Mutates `response.cookies`.
async function refreshSupabaseSession(request: NextRequest, response: NextResponse): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Misconfigured env — not the middleware's job to surface this;
    // server components will fail loudly when they try to use the
    // client. Skip refresh.
    return;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Calling getUser() here is what triggers the cookie refresh in the
  // SSR client. We don't act on the result; we just want the side effect.
  await supabase.auth.getUser();
}

export async function middleware(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").toLowerCase();

  // Build the request headers we'll forward to downstream handlers.
  // Start by stripping any client-supplied tenant headers.
  const forwardHeaders = stripTenantHeaders(request.headers);

  // ── 0. Decide the tenant context ─────────────────────────────────
  let tenantContext: {
    tenantId: string;
    tenantSlug: string;
    domainType: "subdomain" | "custom";
  } | null = null;
  let earlyResponse: NextResponse | null = null;

  const localTenant = isLocalTenantSubdomain(hostname);

  if (PLATFORM_HOSTS.has(hostname) || isLocalDev(hostname)) {
    // Bare local-dev or platform host; no tenant context.
  } else if (localTenant.isLocal && localTenant.subdomain) {
    // Local dev with a tenant subdomain (e.g. demo.localhost:3000).
    if (!RESERVED_SUBDOMAINS.has(localTenant.subdomain)) {
      const tenant = await lookupTenantBySlug(localTenant.subdomain);
      if (tenant) {
        tenantContext = {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          domainType: "subdomain",
        };
      }
      // Unknown subdomain in dev: silently fall through (no tenant
      // context). Don't redirect — that would break the dev loop.
    }
  } else if (!hostname.endsWith(`.${PLATFORM_DOMAIN}`)) {
    // Custom domain branch.
    const tenantDomain = await lookupCustomDomain(hostname);
    if (tenantDomain?.verified && tenantDomain?.ssl_provisioned) {
      tenantContext = {
        tenantId: tenantDomain.tenant_id,
        tenantSlug: tenantDomain.tenant_slug,
        domainType: "custom",
      };
    } else {
      earlyResponse = NextResponse.redirect(`https://${PLATFORM_DOMAIN}`);
    }
  } else {
    // Subdomain branch (production *.churchplatform.com).
    const subdomain = hostname.replace(`.${PLATFORM_DOMAIN}`, "").split(":")[0]!;
    if (!RESERVED_SUBDOMAINS.has(subdomain)) {
      const tenant = await lookupTenantBySlug(subdomain);
      if (!tenant) {
        earlyResponse = NextResponse.redirect(`https://${PLATFORM_DOMAIN}`);
      } else {
        const primary = await lookupPrimaryDomain(tenant.id);
        if (primary && hostname !== primary.domain) {
          const url = new URL(request.url);
          url.hostname = primary.domain;
          url.port = "";
          // 308 (Permanent Redirect) preserves method.
          earlyResponse = NextResponse.redirect(url.toString(), 308);
        } else {
          tenantContext = {
            tenantId: tenant.id,
            tenantSlug: tenant.slug,
            domainType: "subdomain",
          };
        }
      }
    }
  }

  // If we're redirecting, do NOT refresh the session — the response is
  // a redirect and downstream code never sees it.
  if (earlyResponse) {
    return earlyResponse;
  }

  // ── 1. Inject tenant headers on the forwarded request ────────────
  if (tenantContext) {
    forwardHeaders.set("x-tenant-id", tenantContext.tenantId);
    forwardHeaders.set("x-tenant-slug", tenantContext.tenantSlug);
    forwardHeaders.set("x-domain-type", tenantContext.domainType);
  }

  // ── 2. Build the response and refresh the Supabase session ───────
  const response = NextResponse.next({
    request: { headers: forwardHeaders },
  });
  await refreshSupabaseSession(request, response);

  return response;
}

export const config = {
  // Run on everything except Next.js static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
  // Use Node.js runtime so we can talk to Postgres directly.
  // Requires `experimental.nodeMiddleware: true` in next.config.ts.
  runtime: "nodejs",
};

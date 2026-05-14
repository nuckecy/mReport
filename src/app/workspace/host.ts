// Pure helper for rebuilding a request host into a tenant subdomain
// host. Extracted from the server action so unit tests can import it
// without pulling in Drizzle or the tenant lookup chain.

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "churchplatform.com";

/**
 * Convert the current request host into the tenant subdomain host.
 *   localhost:3001        → <slug>.localhost:3001
 *   127.0.0.1:3001        → <slug>.localhost:3001   (IPs don't support
 *                                                    subdomains — rebrand
 *                                                    to localhost)
 *   churchplatform.com    → <slug>.churchplatform.com
 *   www.churchplatform.com → <slug>.churchplatform.com (strip www)
 */
export function buildTenantHost(currentHost: string, slug: string): string {
  if (!currentHost) return `${slug}.${PLATFORM_DOMAIN}`;
  const [rawHostname = "", port] = currentHost.split(":") as [string, string | undefined];
  const hostname = rawHostname.toLowerCase();

  // Dev: IP addresses + bare localhost both go to <slug>.localhost.
  if (hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost") {
    return port ? `${slug}.localhost:${port}` : `${slug}.localhost`;
  }

  // Strip a leading `www.` if present, then prefix with the tenant slug.
  const stripped = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  const tenantHostname = `${slug}.${stripped}`;
  return port ? `${tenantHostname}:${port}` : tenantHostname;
}

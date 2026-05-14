import type { NextConfig } from "next";

/**
 * Security headers applied to every response. Locked down per the security
 * handoff document (§16 Security Headers + §10 CSRF cookie defaults).
 *
 * CSP notes:
 *   - `script-src 'self'` only — no third-party CDNs in v2 (xlsx + lucide come
 *     in via npm now, served from our own origin).
 *   - `connect-src 'self' https://*.supabase.co` — allow API calls to Supabase.
 *   - `style-src 'self' 'unsafe-inline'` — Next.js + Tailwind require inline
 *     styles for hydration. Will tighten in Slice 2 once we move to nonces.
 *   - `frame-ancestors 'none'` — clickjacking defense.
 */
const cspHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed by Next dev; tighten in prod
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), camera=(), microphone=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Stripe-inspired typography:
// - Inter          → display + UI + body (one family does it all)
// - JetBrains Mono → numerics, mono cells, IDs
//
// No serif. Stripe doesn't use one for display, and "sleek/sharp" reads
// as geometric grotesque, not editorial. Inter is the well-known
// open-source substitute for Sohne (Stripe's proprietary face) —
// optical-sized, designed for screens, the closest legal match.
//
// Both fonts ship via next/font so they're self-hosted and FOUC-safe.
const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono-family",
  subsets: ["latin"],
  display: "swap",
});

// Inline init script — runs synchronously in <head> before React hydrates,
// so the very first paint already has the right `data-mode`. Without this
// we'd see a brief flash of light-theme on dark-preferring users.
//
// Stored prefer wins; otherwise the OS preference (prefers-color-scheme)
// decides. The script is intentionally tiny and side-effect-only so it
// stays under the inline CSP budget.
const themeInitScript = `(function(){try{var s=localStorage.getItem('mreport-theme');var m=s||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-mode',m);}catch(e){document.documentElement.setAttribute('data-mode','light');}})();`;

export const metadata: Metadata = {
  title: "mReport",
  description: "Parish report extractor and validator",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // No `data-mode` on the server — the inline script sets it before
      // React paints, ensuring FOUC-free theme on first load. We mark
      // suppressHydrationWarning because the attribute will exist by the
      // time React reconciles.
      suppressHydrationWarning
      className={`${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-bg text-text flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

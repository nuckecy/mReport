"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Client-side providers tree. Wraps the app so server-state hooks (TanStack Query)
 * and any future global UI context have a host.
 *
 * The QueryClient is constructed in `useState` so it's created once per browser
 * session and survives re-renders without being recreated.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Reasonable defaults; tune per-query if a use case needs different behavior.
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

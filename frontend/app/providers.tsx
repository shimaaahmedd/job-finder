"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Client-side context providers for the whole app, mounted in the root layout.
 * The QueryClient is created in state (not at module scope) so each browser
 * session gets its own cache and it survives re-renders.
 */
export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

import { QueryClient } from '@tanstack/react-query';

/**
 * The app's React Query client (DESIGN.md §7). One data-fetching layer that
 * wraps synchronous LocalStorage reads today and async Supabase calls later —
 * the same query keys, so components never change (§9.4).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Local reads are cheap and we invalidate explicitly on writes, so we
        // don't need aggressive background refetching.
        refetchOnWindowFocus: false,
        staleTime: 1000 * 30,
        retry: 1,
      },
    },
  });
}

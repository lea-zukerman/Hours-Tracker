import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RepositoryProvider } from '../app/state/RepositoryContext.tsx';
import type { Repository } from '../data/Repository.ts';

/**
 * A renderHook/render wrapper with a fresh QueryClient (no retries, so failures
 * surface immediately) and an injected Repository. One client per call keeps
 * tests isolated.
 */
export function createWrapper(repository: Repository) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <RepositoryProvider repository={repository}>{children}</RepositoryProvider>
      </QueryClientProvider>
    );
  };
}

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import type { Repository } from '../../data/Repository.ts';
import { createQueryClient } from './queryClient.ts';
import { RepositoryProvider } from './RepositoryContext.tsx';

const defaultQueryClient = createQueryClient();
const defaultRepository = new LocalStorageRepository();

/**
 * Top-level providers: React Query + the injected Repository (DESIGN.md §7).
 * Both are overridable via props — production uses the defaults; tests inject a
 * mock repo and a fresh client.
 */
export function AppProviders({
  children,
  repository = defaultRepository,
  queryClient = defaultQueryClient,
}: {
  children: ReactNode;
  repository?: Repository;
  queryClient?: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <RepositoryProvider repository={repository}>{children}</RepositoryProvider>
    </QueryClientProvider>
  );
}

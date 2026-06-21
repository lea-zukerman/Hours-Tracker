import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { Repository } from '../../data/Repository.ts';

/**
 * Dependency-injection seam for the storage layer (DESIGN.md §5, §7). The whole
 * app reads its Repository from this context, so swapping the implementation
 * (LocalStorage → Supabase, or a mock in tests) needs zero component changes.
 */
const RepositoryContext = createContext<Repository | null>(null);

export function RepositoryProvider({
  repository,
  children,
}: {
  repository: Repository;
  children: ReactNode;
}) {
  return <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRepository(): Repository {
  const repository = useContext(RepositoryContext);
  if (!repository) {
    throw new Error('useRepository must be used within a RepositoryProvider');
  }
  return repository;
}

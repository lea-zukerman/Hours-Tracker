import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Settings } from '../../domain/types.ts';
import { useRepository } from '../state/RepositoryContext.tsx';

export const settingsKey = ['settings'] as const;

/**
 * Read/write the user's Settings (DESIGN.md §7). The repository returns product
 * defaults (182h, 8:36, Sun–Thu) when nothing is stored, so the first run is
 * usable without setup. Saving invalidates the cache so dependent calculations
 * recompute. The settings UI is 8.1 (out of scope here).
 */
export function useSettings() {
  const repository = useRepository();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: settingsKey,
    queryFn: () => repository.getSettings(),
  });

  const mutation = useMutation({
    mutationFn: (settings: Settings) => repository.saveSettings(settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKey }),
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    saveSettings: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

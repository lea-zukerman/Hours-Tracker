import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ID, TimeEntry } from '../../domain/types.ts';
import { useRepository } from '../state/RepositoryContext.tsx';
import { monthRange } from './monthRange.ts';

export const entriesKey = (month: string) => ['entries', month] as const;

/**
 * List + mutate a month's time entries (DESIGN.md §7). Reads via the
 * repository; upsert/delete invalidate this month's query so the dashboard
 * recomputes immediately (SPEC §6.3.17). Summary composition is 3.4.
 */
export function useTimeEntries(month: string) {
  const repository = useRepository();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: entriesKey(month),
    queryFn: () => repository.listEntries(monthRange(month)),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: entriesKey(month) });

  const upsert = useMutation({
    mutationFn: (entry: TimeEntry) => repository.upsertEntry(entry),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: ID) => repository.deleteEntry(id),
    onSuccess: invalidate,
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    upsertEntry: upsert.mutateAsync,
    deleteEntry: remove.mutateAsync,
  };
}

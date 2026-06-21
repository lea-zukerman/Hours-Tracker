import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Absence, ID } from '../../domain/types.ts';
import { useRepository } from '../state/RepositoryContext.tsx';
import { monthRange } from './monthRange.ts';

export const absencesKey = (month: string) => ['absences', month] as const;

/**
 * List + mutate a month's absences (DESIGN.md §7). Returns any absence whose
 * range overlaps the month. upsert/delete invalidate this month's query so
 * dependent calculations recompute immediately.
 */
export function useAbsences(month: string) {
  const repository = useRepository();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: absencesKey(month),
    queryFn: () => repository.listAbsences(monthRange(month)),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: absencesKey(month) });

  const upsert = useMutation({
    mutationFn: (absence: Absence) => repository.upsertAbsence(absence),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: ID) => repository.deleteAbsence(id),
    onSuccess: invalidate,
  });

  return {
    absences: query.data ?? [],
    isLoading: query.isLoading,
    upsertAbsence: upsert.mutateAsync,
    deleteAbsence: remove.mutateAsync,
  };
}

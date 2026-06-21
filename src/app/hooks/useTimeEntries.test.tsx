import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTimeEntries } from './useTimeEntries.ts';
import { useAbsences } from './useAbsences.ts';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';
import { makeEntry, makeAbsence } from '../../domain/__tests__/fixtures.ts';

const MONTH = '2026-06';

describe('useTimeEntries', () => {
  it('lists the month and a write invalidates the query (DoD)', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    const { result } = renderHook(() => useTimeEntries(MONTH), { wrapper: createWrapper(repo) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toEqual([]);

    await result.current.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-18' }));

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.entries[0].id).toBe('e1');
  });

  it('delete invalidates and removes the entry', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    const { result } = renderHook(() => useTimeEntries(MONTH), { wrapper: createWrapper(repo) });

    await result.current.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-18' }));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    await result.current.deleteEntry('e1');
    await waitFor(() => expect(result.current.entries).toHaveLength(0));
  });
});

describe('useAbsences', () => {
  it('lists the month and a write invalidates the query', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    const { result } = renderHook(() => useAbsences(MONTH), { wrapper: createWrapper(repo) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.absences).toEqual([]);

    await result.current.upsertAbsence(makeAbsence({ id: 'a1', dateFrom: '2026-06-10', dateTo: '2026-06-10' }));

    await waitFor(() => expect(result.current.absences).toHaveLength(1));
    expect(result.current.absences[0].id).toBe('a1');
  });
});

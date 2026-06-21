import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMonthSummary } from './useMonthSummary.ts';
import { useTimeEntries } from './useTimeEntries.ts';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';
import { makeEntry } from '../../domain/__tests__/fixtures.ts';

const MONTH = '2026-06';
const OPTS = { today: '2026-06-23', zone: 'Asia/Jerusalem' };

describe('useMonthSummary', () => {
  it('recomputes immediately on edit and delete (DoD)', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    const { result } = renderHook(
      () => ({
        month: useMonthSummary(MONTH, OPTS),
        entries: useTimeEntries(MONTH),
      }),
      { wrapper: createWrapper(repo) },
    );

    await waitFor(() => expect(result.current.month.summary).toBeDefined());
    expect(result.current.month.summary!.workedMinutes).toBe(0);
    expect(result.current.month.summary!.quotaMinutes).toBe(10920);

    // Add an entry → summary recomputes.
    await result.current.entries.upsertEntry(
      makeEntry({ id: 'e1', date: '2026-06-18', manualMinutes: 480 }),
    );
    await waitFor(() => expect(result.current.month.summary!.workedMinutes).toBe(480));
    expect(result.current.month.summary!.balanceMinutes).toBe(480 - 10920);

    // Delete it → summary recomputes back.
    await result.current.entries.deleteEntry('e1');
    await waitFor(() => expect(result.current.month.summary!.workedMinutes).toBe(0));
  });
});

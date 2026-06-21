import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AbsencesSummaryCard } from './AbsencesSummaryCard.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';
import { makeAbsence } from '../../test/fixtures.ts';

describe('AbsencesSummaryCard', () => {
  it('shows vacation used this month and the accrued balance', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    // One vacation work day in June 2026 (16th = Tue).
    await repo.upsertAbsence(
      makeAbsence({ id: 'a1', type: 'vacation', dateFrom: '2026-06-16', dateTo: '2026-06-16' }),
    );

    render(<AbsencesSummaryCard month="2026-06" />, { wrapper: createWrapper(repo) });

    // used this month = 1
    expect(await screen.findByText('חופשה החודש')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    // balance label rendered (calendar-year basis: opening 0 + 1.5*6 − 1 = 8)
    expect(screen.getByText(/יתרה: 8/)).toBeInTheDocument();
  });
});

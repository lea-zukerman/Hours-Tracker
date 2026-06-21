import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EntryCalendar } from './EntryCalendar.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';
import { makeEntry, makeAbsence } from '../../test/fixtures.ts';

describe('EntryCalendar', () => {
  it('marks worked and vacation days for the shown month', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    await repo.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-10', manualMinutes: 480 }));
    await repo.upsertAbsence(
      makeAbsence({ id: 'a1', type: 'vacation', dateFrom: '2026-06-12', dateTo: '2026-06-12' }),
    );

    const { container } = render(<EntryCalendar selected="2026-06-15" onSelect={() => {}} />, {
      wrapper: createWrapper(repo),
    });

    await waitFor(() => expect(container.querySelector('.cal-day--worked')).toBeTruthy());
    expect(container.querySelector('.cal-day--worked')?.textContent).toContain('10');
    expect(container.querySelector('.cal-day--vacation')?.textContent).toContain('12');
  });

  it('calls onSelect with the ISO date when a day is clicked', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    const onSelect = vi.fn();

    render(<EntryCalendar selected="2026-06-15" onSelect={onSelect} />, {
      wrapper: createWrapper(repo),
    });

    fireEvent.click(await screen.findByText('20'));
    expect(onSelect).toHaveBeenCalledWith('2026-06-20');
  });
});

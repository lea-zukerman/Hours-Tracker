import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonthCard } from './MonthCard.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';
import { makeEntry } from '../../test/fixtures.ts';

const ZONE = 'Asia/Jerusalem';

describe('MonthCard', () => {
  it('reproduces the UC-2 display', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    // 143:20 worked = 8600 min; today 2026-06-23 leaves 6 work days.
    await repo.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-10', manualMinutes: 8600 }));

    render(<MonthCard month="2026-06" today="2026-06-23" zone={ZONE} />, {
      wrapper: createWrapper(repo),
    });

    expect(await screen.findByText('143:20')).toBeInTheDocument(); // worked
    expect(screen.getByText(/182:00/)).toBeInTheDocument(); // quota
    expect(screen.getByText('-38:40')).toBeInTheDocument(); // balance deficit
    expect(screen.getByText('6')).toBeInTheDocument(); // remaining work days
    expect(screen.getByText(/6:27/)).toBeInTheDocument(); // required per day
    expect(screen.getByText('גירעון')).toBeInTheDocument(); // status
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportsPage } from './ReportsPage.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';
import { makeEntry } from '../../domain/__tests__/fixtures.ts';

const ZONE = 'Asia/Jerusalem';

describe('ReportsPage', () => {
  it('shows the month table with a logged day', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    await repo.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-10', manualMinutes: 450 }));

    render(<ReportsPage month="2026-06" zone={ZONE} />, { wrapper: createWrapper(repo) });

    expect(await screen.findByText('10-06-2026')).toBeInTheDocument();
    expect(screen.getByText('⬇ ייצוא CSV')).toBeInTheDocument();
  });

  it('navigates to the previous month', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    render(<ReportsPage month="2026-06" zone={ZONE} />, { wrapper: createWrapper(repo) });

    expect(await screen.findByText('06/2026')).toBeInTheDocument();
    fireEvent.click(screen.getByText('◀ חודש קודם'));
    expect(await screen.findByText('05/2026')).toBeInTheDocument();
  });
});

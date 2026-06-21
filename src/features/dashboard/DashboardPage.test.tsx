import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardPage } from './DashboardPage.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';
import { makeEntry } from '../../test/fixtures.ts';

const ZONE = 'Asia/Jerusalem';

describe('DashboardPage', () => {
  it('shows the empty-state CTA when the month has no data', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    render(<DashboardPage today="2026-06-15" zone={ZONE} />, { wrapper: createWrapper(repo) });

    expect(await screen.findByText('▶ התחל לתעד')).toBeInTheDocument();
    // cards are not shown in the empty state
    expect(screen.queryByText('החודש')).not.toBeInTheDocument();
  });

  it('shows the cards once the month has data', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    await repo.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-10', manualMinutes: 480 }));

    render(<DashboardPage today="2026-06-15" zone={ZONE} />, { wrapper: createWrapper(repo) });

    // the three card titles
    expect(await screen.findByText('היום')).toBeInTheDocument();
    expect(screen.getByText('החודש')).toBeInTheDocument();
    expect(screen.getByText('היעדרויות')).toBeInTheDocument();
    // and not the empty state
    expect(screen.queryByText('▶ התחל לתעד')).not.toBeInTheDocument();
  });
});

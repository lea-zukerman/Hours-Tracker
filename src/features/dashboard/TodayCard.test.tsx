import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateTime } from 'luxon';
import { TodayCard } from './TodayCard.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';

const ZONE = 'Asia/Jerusalem';

describe('TodayCard', () => {
  it('shows remaining-for-today, then a live clock once started', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    const current = DateTime.fromISO('2026-06-21T08:00:00', { zone: ZONE });
    const user = userEvent.setup();

    render(<TodayCard zone={ZONE} today="2026-06-21" now={() => current} />, {
      wrapper: createWrapper(repo),
    });

    // Default daily target 8:36; nothing worked yet → that's what's left.
    expect(await screen.findByText('8:36')).toBeInTheDocument();
    expect(screen.getByText(/נשאר/)).toBeInTheDocument();

    // Start → button flips to "stop" and the live "running" status renders.
    await user.click(screen.getByRole('button', { name: /התחל/ }));
    expect(await screen.findByText('רץ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /עצור/ })).toBeInTheDocument();
  });
});

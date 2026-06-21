import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertsBanner } from './AlertsBanner.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';

const ZONE = 'Asia/Jerusalem';

describe('AlertsBanner', () => {
  it('shows a logging-reminder alert for past work days with no entry', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    // Mid-month, nothing logged → many past work days are "missing".
    render(<AlertsBanner month="2026-06" today="2026-06-23" zone={ZONE} />, {
      wrapper: createWrapper(repo),
    });

    const alert = await screen.findByText(/ללא דיווח/);
    expect(alert).toBeInTheDocument();
  });

  it('renders nothing when there are no active alerts', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    // First day of the month → no past work days, no deficit window yet.
    const { container } = render(
      <AlertsBanner month="2026-06" today="2026-06-01" zone={ZONE} />,
      { wrapper: createWrapper(repo) },
    );

    // Give the queries a tick; banner stays empty.
    await Promise.resolve();
    expect(container.querySelector('.alerts')).toBeNull();
  });
});

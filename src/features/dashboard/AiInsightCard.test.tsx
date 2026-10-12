import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiInsightCard } from './AiInsightCard.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';
import { makeEntry, makeShift } from '../../test/fixtures.ts';
import type { InsightInput, InsightResult } from './aiInsight.ts';

const ZONE = 'Asia/Jerusalem';

async function setup(result: InsightResult) {
  const repo = new LocalStorageRepository(memoryStorage());
  await repo.upsertEntry(
    makeEntry({
      date: '2026-06-10',
      // 10h presence → longer than the 8:36 default target
      shifts: [makeShift('2026-06-10T05:00:00.000Z', '2026-06-10T15:00:00.000Z')],
      breakMinutes: 0,
      note: 'פגישה עם רחל',
    }),
  );
  await repo.upsertAbsence({
    id: 'a1',
    userId: 'local',
    dateFrom: '2026-06-14',
    dateTo: '2026-06-15',
    type: 'sick',
  });
  const analyze = vi.fn(async (_input: InsightInput) => result);
  render(<AiInsightCard month="2026-06" today="2026-06-16" zone={ZONE} analyze={analyze} />, {
    wrapper: createWrapper(repo),
  });
  return analyze;
}

describe('AiInsightCard', () => {
  it('sends only summary numbers and shows the analysis', async () => {
    const analyze = await setup({ ok: true, text: 'החודש עבדתם 10:00 שעות.' });
    fireEvent.click(await screen.findByRole('button', { name: 'נתחו את החודש שלי' }));
    expect(await screen.findByText('החודש עבדתם 10:00 שעות.')).toBeInTheDocument();

    const input = analyze.mock.calls[0][0];
    expect(input.month).toBe('2026-06');
    expect(input.daysWorked).toBe(1);
    expect(input.longDays).toBe(1);
    expect(input.absenceDays.sick).toBe(2);
    expect(JSON.stringify(input)).not.toContain('רחל'); // notes never leave the browser
  });

  it('shows a friendly message when the service is busy', async () => {
    await setup({ ok: false, error: 'unavailable' });
    fireEvent.click(await screen.findByRole('button', { name: 'נתחו את החודש שלי' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('שירות ה-AI עמוס כרגע');
  });
});

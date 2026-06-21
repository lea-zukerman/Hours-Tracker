import { describe, it, expect } from 'vitest';
import { absenceDaysUsed } from '../absences.ts';
import { makeSettings, makeAbsence } from './fixtures.ts';

const settings = makeSettings(); // Sun–Thu work days, target 516

describe('absenceDaysUsed', () => {
  it('counts a full-day absence as 1 per work day in range', () => {
    // 2026-06-16 (Tue) … 2026-06-18 (Thu) = 3 work days
    const a = makeAbsence({ type: 'vacation', dateFrom: '2026-06-16', dateTo: '2026-06-18' });
    expect(absenceDaysUsed([a], 'vacation', settings)).toBe(3);
  });

  it('skips weekends (Fri/Sat) within the range', () => {
    // 2026-06-18 (Thu) … 2026-06-21 (Sun): Thu, Sun count; Fri+Sat don't = 2
    const a = makeAbsence({ type: 'vacation', dateFrom: '2026-06-18', dateTo: '2026-06-21' });
    expect(absenceDaysUsed([a], 'vacation', settings)).toBe(2);
  });

  it('counts a partial day as the fraction of the daily target', () => {
    // half a day = 258 / 516 = 0.5, on a single work day
    const a = makeAbsence({
      type: 'sick',
      dateFrom: '2026-06-16',
      dateTo: '2026-06-16',
      partialMinutes: 258,
    });
    expect(absenceDaysUsed([a], 'sick', settings)).toBe(0.5);
  });

  it('only counts the requested type', () => {
    const vac = makeAbsence({ id: 'v', type: 'vacation', dateFrom: '2026-06-16', dateTo: '2026-06-16' });
    const sick = makeAbsence({ id: 's', type: 'sick', dateFrom: '2026-06-17', dateTo: '2026-06-17' });
    expect(absenceDaysUsed([vac, sick], 'vacation', settings)).toBe(1);
    expect(absenceDaysUsed([vac, sick], 'sick', settings)).toBe(1);
  });

  it('clips to the given window', () => {
    // absence spans late May into June; window keeps only June work days
    const a = makeAbsence({ type: 'vacation', dateFrom: '2026-05-28', dateTo: '2026-06-02' });
    // June part: 01 (Mon), 02 (Tue) = 2 work days
    expect(
      absenceDaysUsed([a], 'vacation', settings, { from: '2026-06-01', to: '2026-06-30' }),
    ).toBe(2);
  });
});

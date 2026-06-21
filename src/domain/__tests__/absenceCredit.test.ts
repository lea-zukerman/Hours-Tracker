import { describe, it, expect } from 'vitest';
import { paidAbsenceMinutes, creditedMinutes } from '../calculations.ts';
import { makeSettings, makeAbsence } from './fixtures.ts';

// June 2026 anchors: 18 = Thu, 19 = Fri, 20 = Sat, 21 = Sun, 16 = Tue.
const MONTH = '2026-06';
const TARGET = 516; // daily target minutes (8:36)

describe('paidAbsenceMinutes', () => {
  it('full-day vacation credits the daily target per work day, excluding weekends', () => {
    // Range Thu(18) → Sun(21): work days are Thu + Sun = 2 (Fri/Sat skipped).
    const absence = makeAbsence({ type: 'vacation', dateFrom: '2026-06-18', dateTo: '2026-06-21' });
    expect(paidAbsenceMinutes([absence], makeSettings(), MONTH)).toBe(2 * TARGET); // 1032
  });

  it('partial day credits only the partial amount (half-day sick)', () => {
    const absence = makeAbsence({
      type: 'sick',
      dateFrom: '2026-06-16',
      dateTo: '2026-06-16',
      partialMinutes: TARGET / 2, // 258
    });
    expect(paidAbsenceMinutes([absence], makeSettings(), MONTH)).toBe(258);
  });

  it('credits a paid holiday at the daily target', () => {
    const absence = makeAbsence({ type: 'holiday', dateFrom: '2026-06-16', dateTo: '2026-06-16' });
    expect(paidAbsenceMinutes([absence], makeSettings(), MONTH)).toBe(TARGET);
  });

  it('credits nothing for an unpaid absence', () => {
    const absence = makeAbsence({ type: 'unpaid', dateFrom: '2026-06-15', dateTo: '2026-06-17' });
    expect(paidAbsenceMinutes([absence], makeSettings(), MONTH)).toBe(0);
  });
});

describe('creditedMinutes', () => {
  it('sums worked + paid absence without double counting (UC-4)', () => {
    // Half-day sick (258) + worked the other half (258) = a full target day.
    expect(creditedMinutes(258, 258)).toBe(TARGET);
  });
});

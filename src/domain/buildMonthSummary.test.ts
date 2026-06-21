import { describe, it, expect } from 'vitest';
import { buildMonthSummary } from './calculations.ts';
import { makeSettings, makeEntry } from '../test/fixtures.ts';
import type { MonthInput } from './types.ts';

describe('buildMonthSummary', () => {
  it('reproduces UC-2 exactly (143:20 / 182:00, deficit 38:40, 6 days, ≈6:27/day)', () => {
    // 143:20 worked = 8600 min; quota 182:00 = 10920; today 23 June 2026 (Tue)
    // leaves 6 work days (23,24,25,28,29,30).
    const input: MonthInput = {
      month: '2026-06',
      today: '2026-06-23',
      zone: 'Asia/Jerusalem',
      settings: makeSettings(),
      entries: [makeEntry({ manualMinutes: 8600 })],
      absences: [],
    };

    const summary = buildMonthSummary(input);

    expect(summary.workedMinutes).toBe(8600); // 143:20
    expect(summary.creditedMinutes).toBe(8600);
    expect(summary.quotaMinutes).toBe(10920); // 182:00
    expect(summary.balanceMinutes).toBe(-2320); // deficit 38:40
    expect(summary.remainingWorkdays).toBe(6);
    expect(summary.hoursToCompleteMinutes).toBe(2320);
    expect(summary.requiredPerDayMinutes).toBe(387); // ≈ 6:27
    expect(summary.status).toBe('deficit');
    expect(summary.month).toBe('2026-06');
    expect(summary.userId).toBe('u1');
  });

  it('flags cannot_complete: a deficit with no remaining work days', () => {
    const input: MonthInput = {
      month: '2026-06',
      today: '2026-07-01', // past the month → 0 remaining days
      zone: 'Asia/Jerusalem',
      settings: makeSettings(),
      entries: [makeEntry({ manualMinutes: 8600 })], // still a deficit
      absences: [],
    };

    const summary = buildMonthSummary(input);

    expect(summary.remainingWorkdays).toBe(0);
    expect(summary.requiredPerDayMinutes).toBeNull();
    expect(summary.status).toBe('cannot_complete');
  });

  it('reports surplus when credited exceeds quota', () => {
    const input: MonthInput = {
      month: '2026-06',
      today: '2026-06-23',
      zone: 'Asia/Jerusalem',
      settings: makeSettings(),
      entries: [makeEntry({ manualMinutes: 11000 })], // > quota 10920
      absences: [],
    };

    const summary = buildMonthSummary(input);

    expect(summary.balanceMinutes).toBe(80);
    expect(summary.hoursToCompleteMinutes).toBe(0);
    expect(summary.requiredPerDayMinutes).toBe(0);
    expect(summary.status).toBe('surplus');
  });
});

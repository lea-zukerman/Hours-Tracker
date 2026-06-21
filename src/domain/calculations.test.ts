import { describe, it, expect } from 'vitest';
import { workedMonthMinutes, effectiveQuota } from './calculations.ts';
import { makeSettings, makeEntry, makeShift } from '../test/fixtures.ts';

const ZONE = 'Asia/Jerusalem';

describe('workedMonthMinutes', () => {
  it('returns 0 for an empty month', () => {
    expect(workedMonthMinutes([], makeSettings(), ZONE)).toBe(0);
  });

  it('sums mixed manual + shift entries', () => {
    const entries = [
      makeEntry({
        id: 'e1',
        date: '2026-06-01',
        shifts: [makeShift('2026-06-01T06:00:00.000Z', '2026-06-01T14:00:00.000Z')], // 8h = 480
      }),
      makeEntry({ id: 'e2', date: '2026-06-02', manualMinutes: 300 }), // 5h manual
      makeEntry({
        id: 'e3',
        date: '2026-06-03',
        shifts: [makeShift('2026-06-03T06:00:00.000Z', '2026-06-03T10:00:00.000Z')], // 4h = 240
        breakMinutes: 30,
      }),
    ];
    // 480 + 300 + (240 - 30) = 990
    expect(workedMonthMinutes(entries, makeSettings(), ZONE)).toBe(990);
  });
});

describe('effectiveQuota', () => {
  it('full-time (100%) returns the configured quota', () => {
    const settings = makeSettings({ monthlyQuotaMinutes: 10920, jobPercent: 100 });
    expect(effectiveQuota(settings, '2026-06')).toBe(10920);
  });

  it('part-time scales the quota by job percent', () => {
    const settings = makeSettings({ monthlyQuotaMinutes: 10920, jobPercent: 50 });
    expect(effectiveQuota(settings, '2026-06')).toBe(5460);
  });

  it('rounds to whole minutes', () => {
    const settings = makeSettings({ monthlyQuotaMinutes: 10920, jobPercent: 33 });
    expect(effectiveQuota(settings, '2026-06')).toBe(Math.round((10920 * 33) / 100)); // 3604
  });

  it('quota = 0 yields 0 (no divide-by-zero)', () => {
    const settings = makeSettings({ monthlyQuotaMinutes: 0, jobPercent: 100 });
    expect(effectiveQuota(settings, '2026-06')).toBe(0);
  });
});

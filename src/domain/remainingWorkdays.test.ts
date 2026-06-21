import { describe, it, expect } from 'vitest';
import { remainingWorkdays } from './calculations.ts';
import { makeSettings, makeAbsence } from '../test/fixtures.ts';

const settings = makeSettings(); // work days Sun–Thu

describe('remainingWorkdays', () => {
  it('mid-month: counts work days from today to month end (inclusive)', () => {
    // June 2026, today Sun 21. Work days 21,22,23,24,25,(Fri26/Sat27 off),28,29,30 = 8.
    expect(remainingWorkdays('2026-06-21', '2026-06', settings, [])).toBe(8);
  });

  it('subtracts a planned full-day absence', () => {
    const vacation = makeAbsence({ dateFrom: '2026-06-23', dateTo: '2026-06-23' });
    expect(remainingWorkdays('2026-06-21', '2026-06', settings, [vacation])).toBe(7);
  });

  it('keeps a partial-day absence as a remaining work day', () => {
    const halfDay = makeAbsence({ dateFrom: '2026-06-23', dateTo: '2026-06-23', partialMinutes: 258 });
    expect(remainingWorkdays('2026-06-21', '2026-06', settings, [halfDay])).toBe(8);
  });

  it('non-leap February: stops at the 28th (no Feb 29)', () => {
    // Feb 2027 (non-leap), today Wed 24. Work days 24,25,(Fri/Sat off),28(Sun) = 3.
    expect(remainingWorkdays('2027-02-24', '2027-02', settings, [])).toBe(3);
  });

  it('leap February: includes Feb 29', () => {
    // Feb 2028 (leap), today Thu 24. Work days 24,(Fri/Sat off),27,28,29 = 4.
    expect(remainingWorkdays('2028-02-24', '2028-02', settings, [])).toBe(4);
  });

  it('month ending on a weekend: the weekend tail is not counted', () => {
    // Oct 2026 ends Sat 31. Today Thu 29 → only 29 counts (30 Fri, 31 Sat off) = 1.
    expect(remainingWorkdays('2026-10-29', '2026-10', settings, [])).toBe(1);
  });

  it('returns 0 when today is past the month end', () => {
    expect(remainingWorkdays('2026-07-05', '2026-06', settings, [])).toBe(0);
  });
});

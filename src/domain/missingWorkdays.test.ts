import { describe, it, expect } from 'vitest';
import { missingWorkdays } from './calculations.ts';
import { makeSettings, makeEntry, makeAbsence, makeShift } from '../test/fixtures.ts';

const settings = makeSettings(); // Sun–Thu
// June 2026: 1 Mon, 2 Tue, 3 Wed are work days; 4 Thu used as "today".
const TODAY = '2026-06-04';
const MONTH = '2026-06';

describe('missingWorkdays', () => {
  it('flags past work days with no entry and no absence', () => {
    expect(missingWorkdays(TODAY, MONTH, settings, [], [])).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
    ]);
  });

  it('does not flag a day that has an entry', () => {
    const entries = [
      makeEntry({ date: '2026-06-02', shifts: [makeShift('2026-06-02T06:00:00.000Z', '2026-06-02T14:00:00.000Z')] }),
    ];
    expect(missingWorkdays(TODAY, MONTH, settings, entries, [])).toEqual([
      '2026-06-01',
      '2026-06-03',
    ]);
  });

  it('does not flag a day covered by an absence', () => {
    const absences = [makeAbsence({ dateFrom: '2026-06-03', dateTo: '2026-06-03' })];
    expect(missingWorkdays(TODAY, MONTH, settings, [], absences)).toEqual([
      '2026-06-01',
      '2026-06-02',
    ]);
  });

  it('never flags today or a future day', () => {
    const result = missingWorkdays(TODAY, MONTH, settings, [], []);
    expect(result).not.toContain('2026-06-04'); // today
    expect(result).not.toContain('2026-06-10'); // future work day
  });
});

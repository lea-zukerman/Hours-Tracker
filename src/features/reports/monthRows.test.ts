import { describe, it, expect } from 'vitest';
import { buildMonthRows } from './monthRows.ts';
import { buildShift } from '../timeEntry/shiftInstants.ts';
import { makeSettings, makeEntry, makeAbsence } from '../../domain/__tests__/fixtures.ts';

const ZONE = 'Asia/Jerusalem';
const settings = makeSettings();

describe('buildMonthRows', () => {
  it('builds an entry row with in/out, break and net', () => {
    const entry = makeEntry({
      date: '2026-06-10',
      shifts: [buildShift('2026-06-10', '09:00', '17:00', ZONE)],
      breakMinutes: 30,
    });

    const [row] = buildMonthRows('2026-06', [entry], [], settings, ZONE);

    expect(row.date).toBe('2026-06-10');
    expect(row.inTime).toBe('09:00');
    expect(row.outTime).toBe('17:00');
    expect(row.breakMinutes).toBe(30);
    expect(row.netMinutes).toBe(450); // 480 − 30
  });

  it('adds an absence row and sorts by date', () => {
    const entry = makeEntry({ date: '2026-06-10', manualMinutes: 480 });
    const absence = makeAbsence({ type: 'vacation', dateFrom: '2026-06-11', dateTo: '2026-06-11' });

    const rows = buildMonthRows('2026-06', [entry], [absence], settings, ZONE);

    expect(rows.map((r) => r.date)).toEqual(['2026-06-10', '2026-06-11']);
    expect(rows[1].absence).toBe('חופשה');
  });

  it('marks each in-month day of a multi-day absence', () => {
    const absence = makeAbsence({ type: 'sick', dateFrom: '2026-06-10', dateTo: '2026-06-12' });
    const rows = buildMonthRows('2026-06', [], [absence], settings, ZONE);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.absence === 'מחלה')).toBe(true);
  });
});

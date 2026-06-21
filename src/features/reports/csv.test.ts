import { describe, it, expect } from 'vitest';
import { toCsv } from './csv.ts';
import type { ReportRow } from './monthRows.ts';
import type { MonthSummary } from '../../domain/types.ts';

const summary: MonthSummary = {
  userId: 'u1',
  month: '2026-06',
  workedMinutes: 450,
  creditedMinutes: 450,
  quotaMinutes: 10920,
  balanceMinutes: -10470,
  remainingWorkdays: 5,
  hoursToCompleteMinutes: 10470,
  requiredPerDayMinutes: 2094,
  status: 'deficit',
};

const rows: ReportRow[] = [
  {
    date: '2026-06-10',
    inTime: '09:00',
    outTime: '17:00',
    breakMinutes: 30,
    netMinutes: 450,
    absence: '',
    note: 'הערה, עם פסיק',
  },
];

describe('toCsv', () => {
  it('starts with a UTF-8 BOM and the header', () => {
    const csv = toCsv(rows, summary);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('תאריך');
  });

  it('includes the row data, the summary, and escapes commas', () => {
    const csv = toCsv(rows, summary);
    expect(csv).toContain('10-06-2026');
    expect(csv).toContain('7:30'); // net 450 min
    expect(csv).toContain('"הערה, עם פסיק"'); // comma → quoted
    expect(csv).toContain('עבדת');
    expect(csv).toContain('מאזן');
  });
});

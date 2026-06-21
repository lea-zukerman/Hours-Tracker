import { DateTime } from 'luxon';
import type { Absence, AbsenceType, IsoDate, Settings, TimeEntry } from '../../domain/types.ts';
import { entryWorkedMinutes } from '../../domain/time.ts';
import { formatTime24 } from '../../ui/format.ts';

const ABSENCE_LABELS: Record<AbsenceType, string> = {
  vacation: 'חופשה',
  sick: 'מחלה',
  holiday: 'חג',
  reserve: 'מילואים',
  unpaid: 'חל״ת',
};

/** One day's row in the month report (DESIGN.md §8; SPEC §3.5). */
export interface ReportRow {
  date: IsoDate;
  inTime: string; // first shift's clock-in (local HH:mm), '' if none
  outTime: string; // last shift's clock-out, '' if open/none
  breakMinutes: number;
  netMinutes: number;
  absence: string; // Hebrew label(s), '' if none
  note: string;
}

/**
 * Build the day-by-day rows for a month from entries + absences (DESIGN.md §8;
 * SPEC §3.5). One row per date that has an entry and/or an absence; a full-range
 * absence marks each of its in-month days. Rows are sorted by date. Pure —
 * display formatting only, computation stays in the domain.
 */
export function buildMonthRows(
  month: string,
  entries: TimeEntry[],
  absences: Absence[],
  settings: Settings,
  zone: string,
): ReportRow[] {
  const rows = new Map<IsoDate, ReportRow>();

  const blank = (date: IsoDate): ReportRow => ({
    date,
    inTime: '',
    outTime: '',
    breakMinutes: 0,
    netMinutes: 0,
    absence: '',
    note: '',
  });

  for (const entry of entries) {
    const row = rows.get(entry.date) ?? blank(entry.date);
    const first = entry.shifts[0];
    const last = entry.shifts[entry.shifts.length - 1];
    row.inTime = first ? formatTime24(first.start, zone) : '';
    row.outTime = last && last.end ? formatTime24(last.end, zone) : '';
    row.breakMinutes = entry.breakMinutes;
    row.netMinutes = entryWorkedMinutes(entry, settings, zone);
    row.note = entry.note ?? '';
    rows.set(entry.date, row);
  }

  for (const absence of absences) {
    let cursor = DateTime.fromISO(absence.dateFrom);
    const end = DateTime.fromISO(absence.dateTo);
    if (!cursor.isValid || !end.isValid) continue;
    const label = ABSENCE_LABELS[absence.type];
    while (cursor <= end) {
      const iso = cursor.toFormat('yyyy-MM-dd');
      if (cursor.toFormat('yyyy-MM') === month) {
        const row = rows.get(iso) ?? blank(iso);
        row.absence = row.absence ? `${row.absence}, ${label}` : label;
        rows.set(iso, row);
      }
      cursor = cursor.plus({ days: 1 });
    }
  }

  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}

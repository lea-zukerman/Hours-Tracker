import { DateTime } from 'luxon';
import type { Absence, AbsenceType, IsoDate, Settings } from './types.ts';
import { isWorkDay } from './time.ts';

/**
 * Accrued absence balance, in days (DESIGN.md §6, absences.ts; SPEC §3.6).
 *
 * balance = opening + accrualPerMonth × monthsElapsed − used
 *
 * Fractional days are expected (accrual is often 1.5/month). A negative
 * result means usage exceeded what was accrued — the "quota overage" flag
 * (SPEC §6.4.25); callers (alerts, 8.2) treat balance < 0 as the warning,
 * so no separate flag is needed.
 */
export function absenceBalance(
  opening: number,
  accrualPerMonth: number,
  monthsElapsed: number,
  used: number,
): number {
  return opening + accrualPerMonth * monthsElapsed - used;
}

/**
 * Days of a given absence type used on work days, optionally clipped to a date
 * window (DESIGN.md §6, absences.ts; SPEC §3.6, §3.1.3).
 *
 * Counts, per work day (settings.workDays) inside each matching absence's range:
 * - a full-day absence → 1 day;
 * - a partial day (`partialMinutes` set) → partialMinutes / dailyTargetMinutes.
 * Weekends are not counted. Mirrors the crediting logic in
 * paidAbsenceMinutes so "days used" and "minutes credited" stay consistent.
 *
 * @param window optional inclusive [from, to] clip — used for "this month" or
 *               "year to date" sums; omit to count each absence's full range.
 */
export function absenceDaysUsed(
  absences: Absence[],
  type: AbsenceType,
  settings: Settings,
  window?: { from: IsoDate; to: IsoDate },
): number {
  let days = 0;
  for (const absence of absences) {
    if (absence.type !== type) continue;

    const from = window && window.from > absence.dateFrom ? window.from : absence.dateFrom;
    const to = window && window.to < absence.dateTo ? window.to : absence.dateTo;

    let cursor = DateTime.fromISO(from);
    const end = DateTime.fromISO(to);
    if (!cursor.isValid || !end.isValid) continue;

    const perDay =
      absence.partialMinutes !== undefined
        ? absence.partialMinutes / settings.dailyTargetMinutes
        : 1;

    while (cursor <= end) {
      const iso = cursor.toFormat('yyyy-MM-dd');
      if (isWorkDay(iso, settings)) days += perDay;
      cursor = cursor.plus({ days: 1 });
    }
  }
  return days;
}

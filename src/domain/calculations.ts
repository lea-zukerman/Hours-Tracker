import { DateTime } from 'luxon';
import type { Absence, Minutes, Settings, TimeEntry } from './types.ts';
import { entryWorkedMinutes, isWorkDay } from './time.ts';

/**
 * Sum of net worked minutes across a month's entries (DESIGN.md §6,
 * calculations.ts).
 *
 * NOTE — deliberate signature deviation from DESIGN §6 / TASKS 1.5, which
 * list `(entries, zone)`. The per-entry computation (1.4 entryWorkedMinutes)
 * requires `settings` to apply the auto-break policy; omitting it would
 * silently drop auto-break and yield wrong totals. `settings` is threaded
 * through here for correctness.
 */
export function workedMonthMinutes(
  entries: TimeEntry[],
  settings: Settings,
  zone: string,
): Minutes {
  return entries.reduce((sum, entry) => sum + entryWorkedMinutes(entry, settings, zone), 0);
}

/**
 * Effective monthly quota in minutes, scaled by job percent (DESIGN.md §6,
 * calculations.ts; SPEC §6.4.23).
 *
 * quota = monthlyQuotaMinutes × jobPercent / 100, rounded to whole minutes.
 * A quota of 0 yields 0 (no division here — the divide-by-zero guard lives
 * in requiredPerDay, 1.11).
 *
 * TODO (deferred — SPEC §6.4.23 mid-month pro-rata): a job-percent change
 * partway through the month should produce a day-weighted average quota.
 * The current data model (Settings.jobPercent, single value) can't express
 * a mid-month change, so this is intentionally not handled yet. When needed,
 * add an optional change schedule to Settings and weight by days here — a
 * backward-compatible extension. The `month` param is reserved for it.
 */
export function effectiveQuota(settings: Settings, _month: string): Minutes {
  return Math.round((settings.monthlyQuotaMinutes * settings.jobPercent) / 100);
}

/**
 * Paid-absence credit for a month, in minutes (DESIGN.md §6, calculations.ts;
 * SPEC §3.6, §6.2.10-13).
 *
 * Each **work day** (settings.workDays) within an absence's date range that
 * falls inside `month` is credited:
 * - full-day absence → the daily target;
 * - partial day (`partialMinutes` set) → that partial amount only.
 * Weekends inside a range are not credited, and `unpaid` absences credit
 * nothing. Vacation, sick, holiday and reserve are all paid.
 */
export function paidAbsenceMinutes(
  absences: Absence[],
  settings: Settings,
  month: string,
): Minutes {
  let total = 0;
  for (const absence of absences) {
    if (absence.type === 'unpaid') continue;

    let cursor = DateTime.fromISO(absence.dateFrom);
    const end = DateTime.fromISO(absence.dateTo);
    if (!cursor.isValid || !end.isValid) continue;

    const perDay =
      absence.partialMinutes !== undefined ? absence.partialMinutes : settings.dailyTargetMinutes;

    while (cursor <= end) {
      const iso = cursor.toFormat('yyyy-MM-dd');
      if (cursor.toFormat('yyyy-MM') === month && isWorkDay(iso, settings)) {
        total += perDay;
      }
      cursor = cursor.plus({ days: 1 });
    }
  }
  return total;
}

/**
 * Credited minutes = worked + paid absence (DESIGN.md §6; SPEC §3.0 line 93).
 * The no-double-count guarantee is structural: a partial absence credits only
 * its partial amount, so summing with the same day's worked minutes never
 * over-counts (SPEC §6.2.13, UC-4).
 */
export function creditedMinutes(worked: Minutes, paidAbsence: Minutes): Minutes {
  return worked + paidAbsence;
}

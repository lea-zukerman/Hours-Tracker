import { DateTime } from 'luxon';
import type { Absence, IsoDate, Minutes, MonthStatus, Settings, TimeEntry } from './types.ts';
import { entryWorkedMinutes, isWorkDay } from './time.ts';

/**
 * True when a **full-day** absence covers the given calendar day. Partial-day
 * absences (partialMinutes set) don't remove the day — you still work part of
 * it — so they don't reduce the remaining/available work days.
 * ISO 'YYYY-MM-DD' strings compare correctly with lexicographic <=.
 */
function isFullDayAbsentOn(iso: IsoDate, absences: Absence[]): boolean {
  return absences.some(
    (a) => a.partialMinutes === undefined && a.dateFrom <= iso && iso <= a.dateTo,
  );
}

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

/**
 * Month balance = credited − quota (DESIGN.md §6; SPEC §3.0 line 94).
 * Negative = deficit, positive = surplus.
 *
 * Each month is standalone — a surplus does NOT roll over (SPEC §6.4.22).
 * This is structural: only the current month's credited and quota are inputs,
 * so no prior balance can leak in.
 */
export function balanceMinutes(credited: Minutes, quota: Minutes): Minutes {
  return credited - quota;
}

/**
 * Month status derived from the balance alone (DESIGN.md §4 MonthStatus):
 * positive → surplus, negative → deficit, exactly zero → on_track.
 *
 * NOTE: `cannot_complete` (a deficit with no remaining work days to close it)
 * needs the remaining-days context and is applied a layer up, in
 * buildMonthSummary (1.11/1.12).
 */
export function monthStatus(balance: Minutes): MonthStatus {
  if (balance > 0) return 'surplus';
  if (balance < 0) return 'deficit';
  return 'on_track';
}

/**
 * Count of remaining work days from `today` (inclusive) to month end, minus
 * planned full-day absences (DESIGN.md §6, calculations.ts).
 *
 * Counts each configured work day (settings.workDays) in the window
 * [max(today, month start) … month end] that isn't covered by a full-day
 * absence. Today counts if it's a work day (it may still be completed).
 * Returns 0 if `today` is past the month's end.
 */
export function remainingWorkdays(
  today: IsoDate,
  month: string,
  settings: Settings,
  absences: Absence[],
): number {
  const monthStart = DateTime.fromISO(`${month}-01`);
  if (!monthStart.isValid) return 0;
  const monthEnd = monthStart.endOf('month');

  const todayDt = DateTime.fromISO(today);
  // Begin at the later of today and the month's first day.
  let cursor =
    todayDt.isValid && todayDt > monthStart ? todayDt.startOf('day') : monthStart;
  if (cursor > monthEnd) return 0;

  let count = 0;
  while (cursor <= monthEnd) {
    const iso = cursor.toFormat('yyyy-MM-dd');
    if (isWorkDay(iso, settings) && !isFullDayAbsentOn(iso, absences)) {
      count++;
    }
    cursor = cursor.plus({ days: 1 });
  }
  return count;
}

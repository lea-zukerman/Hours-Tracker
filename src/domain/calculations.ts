import type { Minutes, Settings, TimeEntry } from './types.ts';
import { entryWorkedMinutes } from './time.ts';

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

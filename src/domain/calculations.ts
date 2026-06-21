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

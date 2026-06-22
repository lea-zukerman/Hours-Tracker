import { DateTime } from 'luxon';
import type { IsoDate, Minutes, Settings, Shift, TimeEntry, Weekday } from './types.ts';

/**
 * Day-of-week for a calendar day, as our Weekday (0 = Sunday … 6 = Saturday).
 * Luxon uses Mon=1…Sun=7; `% 7` maps Sun(7)→0 and leaves Mon..Sat as 1..6.
 */
export function weekdayOf(isoDate: IsoDate): Weekday {
  return (DateTime.fromISO(isoDate).weekday % 7) as Weekday;
}

/** True when the given calendar day is a configured work day. */
export function isWorkDay(isoDate: IsoDate, settings: Settings): boolean {
  return settings.workDays.includes(weekdayOf(isoDate));
}

/**
 * Duration of a single shift, in integer minutes (DESIGN.md §6, time.ts).
 *
 * Computed from absolute UTC instants via Luxon — NEVER from wall-clock
 * subtraction. This makes midnight crossing and DST transitions (23h / 25h
 * days) correct for free: the elapsed time between two instants is the same
 * no matter what the local clock did in between, and no matter the viewer's
 * time zone (DESIGN.md §1.4, SPEC §6.1.6 — travel).
 *
 * @param shift the shift; `end: null` means the clock is still running
 * @param _zone IANA zone — part of the contract for signature consistency,
 *              but the duration itself is zone-independent (see above).
 * @returns net seconds; 0 for an open shift or invalid/zero-length input.
 */
export function netShiftSeconds(shift: Shift, _zone: string): number {
  // Open shift: a pure function can't measure a running clock without "now".
  // The live display is the caller's concern (useClock, Milestone 3.5).
  if (shift.end === null) return 0;

  const start = DateTime.fromISO(shift.start, { zone: 'utc' });
  const end = DateTime.fromISO(shift.end, { zone: 'utc' });
  if (!start.isValid || !end.isValid) return 0;

  const seconds = Math.round(end.diff(start, 'seconds').seconds);
  return seconds > 0 ? seconds : 0; // out <= in → 0
}

/** Net minutes for a shift — the whole-minute rounding used in all calculations. */
export function netShiftMinutes(shift: Shift, zone: string): Minutes {
  return Math.round(netShiftSeconds(shift, zone) / 60);
}

/**
 * Auto-deducted break for a day's presence (DESIGN.md §6, SPEC §3.2B).
 *
 * Policy: when enabled and total presence exceeds the threshold, a fixed
 * amount is deducted. This is separate from manual breaks already recorded
 * on the entry's `breakMinutes`.
 *
 * @returns the minutes to deduct; 0 when disabled or under threshold.
 */
export function autoBreakMinutes(presenceMinutes: Minutes, settings: Settings): Minutes {
  if (!settings.autoBreakEnabled) return 0;
  if (presenceMinutes <= settings.autoBreakThresholdMinutes) return 0;
  return settings.autoBreakDeductMinutes;
}

/**
 * Net worked minutes for one day's entry (DESIGN.md §6, time.ts).
 *
 * Two modes:
 * - **Manual total** (`manualMinutes` set): the day was logged as a bare
 *   hours total with no exact times — return it as-is (SPEC §3.2B).
 * - **Shifts**: sum each shift's net duration (presence), then subtract
 *   manual breaks and the auto-break computed on that presence.
 *
 * Auto-break is computed on total presence (sum of shifts) before any
 * deduction. The result is floored at 0 (breaks can't make a day negative).
 */
export function entryWorkedMinutes(
  entry: TimeEntry,
  settings: Settings,
  zone: string,
): Minutes {
  if (entry.manualMinutes !== undefined) {
    return Math.max(0, entry.manualMinutes);
  }

  const presence = entry.shifts.reduce((sum, shift) => sum + netShiftMinutes(shift, zone), 0);
  const autoBreak = autoBreakMinutes(presence, settings);
  const worked = presence - entry.breakMinutes - autoBreak;
  return Math.max(0, worked);
}

/**
 * Net worked **seconds** for one day's entry — the exact figure the live "Today"
 * card shows (SPEC §3.0), so a short session reads as its true time rather than
 * rounding to 0. Same shape as entryWorkedMinutes but seconds-precise; breaks
 * are in minutes, converted to seconds.
 */
export function entryWorkedSeconds(entry: TimeEntry, settings: Settings, zone: string): number {
  if (entry.manualMinutes !== undefined) {
    return Math.max(0, entry.manualMinutes) * 60;
  }

  const presenceSeconds = entry.shifts.reduce((sum, shift) => sum + netShiftSeconds(shift, zone), 0);
  const autoBreak = autoBreakMinutes(Math.round(presenceSeconds / 60), settings);
  const worked = presenceSeconds - entry.breakMinutes * 60 - autoBreak * 60;
  return Math.max(0, worked);
}

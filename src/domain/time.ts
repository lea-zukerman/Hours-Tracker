import { DateTime } from 'luxon';
import type { Minutes, Shift } from './types.ts';

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
 * @returns net minutes; 0 for an open shift or invalid/zero-length input.
 */
export function netShiftMinutes(shift: Shift, _zone: string): Minutes {
  // Open shift: a pure function can't measure a running clock without "now".
  // The live display is the caller's concern (useClock, Milestone 3.5).
  if (shift.end === null) return 0;

  const start = DateTime.fromISO(shift.start, { zone: 'utc' });
  const end = DateTime.fromISO(shift.end, { zone: 'utc' });
  if (!start.isValid || !end.isValid) return 0;

  const minutes = end.diff(start, 'minutes').minutes;
  if (minutes <= 0) return 0; // out <= in
  return Math.round(minutes);
}

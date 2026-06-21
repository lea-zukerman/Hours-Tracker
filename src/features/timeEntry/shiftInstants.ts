import { DateTime } from 'luxon';
import type { IsoDate, Shift } from '../../domain/types.ts';

/**
 * Build a Shift from local wall-clock times on a calendar day in `zone`
 * (the inverse of display formatting). Times are 'HH:mm'.
 *
 * - empty `endTime` → an open shift (`end: null`);
 * - `end <= start` → the shift crossed midnight, so the end rolls to the next
 *   day (SPEC §6.1.1);
 * - unparseable input → best-effort empty strings, which `validateEntry` then
 *   flags as `invalid_input` / `clock_out_without_in` (no silent dropping).
 */
export function buildShift(
  date: IsoDate,
  startTime: string,
  endTime: string,
  zone: string,
): Shift {
  const start = DateTime.fromISO(`${date}T${startTime}`, { zone });
  const startISO = startTime && start.isValid ? start.toUTC().toISO()! : '';

  if (!endTime) return { start: startISO, end: null };

  let end = DateTime.fromISO(`${date}T${endTime}`, { zone });
  if (start.isValid && end.isValid && end <= start) end = end.plus({ days: 1 });
  const endISO = end.isValid ? end.toUTC().toISO()! : '';

  return { start: startISO, end: endISO };
}

/** Local 'HH:mm' times for a stored Shift, for prefilling the edit form. */
export function shiftLocalTimes(shift: Shift, zone: string): { start: string; end: string } {
  const toHHmm = (iso: string | null): string => {
    if (!iso) return '';
    const dt = DateTime.fromISO(iso, { zone });
    return dt.isValid ? dt.toFormat('HH:mm') : '';
  };
  return { start: toHHmm(shift.start), end: toHHmm(shift.end) };
}

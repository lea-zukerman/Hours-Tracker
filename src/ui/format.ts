import { DateTime } from 'luxon';

/**
 * Base display helpers (DESIGN.md §8 — Hebrew/RTL, 24h, DD-MM-YYYY).
 * Display-only: all internal math stays in integer minutes (DESIGN.md §1.3).
 */

/** Format an ISO calendar day ('YYYY-MM-DD') as 'DD-MM-YYYY'. */
export function formatDate(isoDate: string): string {
  const dt = DateTime.fromISO(isoDate);
  if (!dt.isValid) return isoDate;
  return dt.toFormat('dd-MM-yyyy');
}

/** Format a UTC instant as 24h wall-clock 'HH:mm' in the given IANA zone. */
export function formatTime24(isoInstant: string, zone: string): string {
  const dt = DateTime.fromISO(isoInstant, { zone });
  if (!dt.isValid) return '';
  return dt.toFormat('HH:mm');
}

/** Format integer minutes as 'H:MM' (e.g. 516 → '8:36'). Negative-safe. */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

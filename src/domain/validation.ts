import { DateTime } from 'luxon';
import type {
  IsoInstant,
  TimeEntry,
  ValidationIssue,
  ValidationResult,
} from './types.ts';
import { netShiftMinutes } from './time.ts';

/**
 * Validate a time entry against the input rules (DESIGN.md §6, validation.ts;
 * SPEC §3.2C, §6.1.3-7, §6.3.15/18). Returns domain codes only — the UI maps
 * them to Hebrew messages (5.3). All issues are collected (not short-circuited)
 * so the form can show everything at once.
 *
 * @param now optional reference instant for the "future" check; defaults to the
 *            current time. Injected in tests for determinism.
 */
export function validateEntry(
  entry: TimeEntry,
  zone: string,
  now: IsoInstant = DateTime.utc().toISO()!,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const nowDt = DateTime.fromISO(now, { zone: 'utc' });

  // Manual-total entry: no exact times — just sanity-check the number.
  if (entry.manualMinutes !== undefined) {
    if (!Number.isFinite(entry.manualMinutes) || entry.manualMinutes < 0) {
      issues.push({ code: 'invalid_input' });
    }
    return finalize(issues);
  }

  if (!Number.isFinite(entry.breakMinutes) || entry.breakMinutes < 0) {
    issues.push({ code: 'invalid_input' });
  }

  entry.shifts.forEach((shift, i) => {
    const hasStart = typeof shift.start === 'string' && shift.start.length > 0;
    const startDt = hasStart ? DateTime.fromISO(shift.start, { zone: 'utc' }) : null;
    const endDt =
      shift.end !== null ? DateTime.fromISO(shift.end, { zone: 'utc' }) : null;

    // Clock-out with no clock-in: an end recorded without a start.
    if (!hasStart) {
      if (shift.end !== null) issues.push({ code: 'clock_out_without_in', shiftIndex: i });
      else issues.push({ code: 'invalid_input', shiftIndex: i });
      return;
    }

    // Unparseable instants: 25:00, text, etc.
    if (!startDt!.isValid || (endDt !== null && !endDt.isValid)) {
      issues.push({ code: 'invalid_input', shiftIndex: i });
      return;
    }

    // Out before in (as absolute instants — midnight crossing is fine).
    if (endDt !== null && endDt < startDt!) {
      issues.push({ code: 'out_before_in', shiftIndex: i });
    }

    // Worked hours in the future (start, or end, beyond now).
    const endInFuture = endDt !== null && endDt > nowDt;
    if (startDt! > nowDt || endInFuture) {
      issues.push({ code: 'future_worked_hours', shiftIndex: i });
    }
  });

  // Overlapping shifts (only meaningful for complete, valid pairs).
  if (hasOverlap(entry)) {
    issues.push({ code: 'overlapping_shifts' });
  }

  // Break can't exceed total presence.
  const presence = entry.shifts.reduce((sum, s) => sum + netShiftMinutes(s, zone), 0);
  if (entry.breakMinutes > presence) {
    issues.push({ code: 'break_exceeds_presence' });
  }

  return finalize(issues);
}

function finalize(issues: ValidationIssue[]): ValidationResult {
  return { valid: issues.length === 0, issues };
}

/** True if any two complete shifts overlap in time. */
function hasOverlap(entry: TimeEntry): boolean {
  const ranges = entry.shifts
    .filter((s) => s.start && s.end !== null)
    .map((s) => ({
      start: DateTime.fromISO(s.start, { zone: 'utc' }),
      end: DateTime.fromISO(s.end!, { zone: 'utc' }),
    }))
    .filter((r) => r.start.isValid && r.end.isValid);

  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      if (a.start < b.end && b.start < a.end) return true;
    }
  }
  return false;
}

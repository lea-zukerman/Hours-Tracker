import type { TimeEntry } from '../domain/types.ts';

/**
 * The one-entry-per-day rule (DESIGN.md §4 design notes): a new entry on a day
 * that already has one is folded into it — shifts and breaks accumulate, and the
 * newer manual total / note win when given. Shared by every Repository.
 */
export function mergeIntoDay(existing: TimeEntry, incoming: TimeEntry): TimeEntry {
  return {
    ...existing,
    shifts: [...existing.shifts, ...incoming.shifts],
    breakMinutes: existing.breakMinutes + incoming.breakMinutes,
    manualMinutes: incoming.manualMinutes ?? existing.manualMinutes,
    note: incoming.note ?? existing.note,
  };
}

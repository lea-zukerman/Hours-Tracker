import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { ID, TimeEntry } from '../../domain/types.ts';
import { useRepository } from '../state/RepositoryContext.tsx';
import { entriesKey } from './useTimeEntries.ts';
import { LOCAL_USER_ID } from '../../data/LocalStorageRepository.ts';

const DEFAULT_ZONE = 'Asia/Jerusalem';

/**
 * Live work clock (DESIGN.md §7). Start persists an open shift (end: null) on
 * today's entry; a 1-second ticker updates the displayed elapsed time only — it
 * never writes to storage per tick (DoD). Stop finalizes the open shift's end
 * and persists. Writes invalidate the month query so the dashboard recomputes.
 *
 * Midnight: a running shift that crosses midnight is detected and flagged on
 * the entry's note. TODO (§6.1.1): full split into two day-entries — deferred;
 * the duration is correct regardless since it's computed from UTC instants.
 *
 * @param opts.now injectable clock for tests/determinism (default: real time).
 */
export function useClock(opts?: { zone?: string; now?: () => DateTime }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const zone = opts?.zone ?? DEFAULT_ZONE;
  const now = useCallback(() => (opts?.now ? opts.now() : DateTime.now().setZone(zone)), [opts, zone]);

  const [runningId, setRunningId] = useState<ID | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startRef = useRef<DateTime | null>(null);
  const isRunning = runningId !== null;

  // 1-second ticker — UI state only, no storage writes.
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      if (startRef.current) {
        setElapsedSeconds(Math.max(0, Math.floor(now().diff(startRef.current, 'seconds').seconds)));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, now]);

  const invalidateMonth = (date: string) =>
    queryClient.invalidateQueries({ queryKey: entriesKey(date.slice(0, 7)) });

  async function start(): Promise<void> {
    if (isRunning) return;
    const startAt = now();
    const today = startAt.toISODate()!;
    startRef.current = startAt;

    const openShift = { start: startAt.toUTC().toISO()!, end: null };
    const [existing] = await repository.listEntries({ from: today, to: today });
    const entry: TimeEntry = existing
      ? { ...existing, shifts: [...existing.shifts, openShift] }
      : {
          id: crypto.randomUUID(),
          userId: LOCAL_USER_ID,
          date: today,
          shifts: [openShift],
          breakMinutes: 0,
        };

    await repository.upsertEntry(entry);
    void invalidateMonth(today);
    setRunningId(entry.id);
    setElapsedSeconds(0);
  }

  async function stop(): Promise<void> {
    if (runningId === null) return;
    const endAt = now();

    const entry = await repository.getEntry(runningId);
    if (entry) {
      const startAt = startRef.current;
      const crossedMidnight = startAt !== null && startAt.toISODate() !== endAt.toISODate();
      const shifts = entry.shifts.map((s) =>
        s.end === null ? { ...s, end: endAt.toUTC().toISO()! } : s,
      );
      const updated: TimeEntry = {
        ...entry,
        shifts,
        note: crossedMidnight ? appendFlag(entry.note, 'midnight') : entry.note,
      };
      await repository.upsertEntry(updated);
      void invalidateMonth(entry.date);
    }

    startRef.current = null;
    setRunningId(null);
    setElapsedSeconds(0);
  }

  return { isRunning, elapsedSeconds, start, stop };
}

function appendFlag(note: string | undefined, flag: string): string {
  const marker = `[${flag}]`;
  if (note && note.includes(marker)) return note;
  return note ? `${note} ${marker}` : marker;
}

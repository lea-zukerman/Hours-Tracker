import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { ID, TimeEntry } from '../../domain/types.ts';
import { useRepository } from '../state/RepositoryContext.tsx';
import { entriesKey } from './useTimeEntries.ts';
import { LOCAL_USER_ID } from '../../data/LocalStorageRepository.ts';

const DEFAULT_ZONE = 'Asia/Jerusalem';

/**
 * Live work clock (DESIGN.md §7; SPEC §3.2A). Start persists an open shift
 * (end: null) on today's entry; a 1-second ticker updates the displayed elapsed
 * time only — it never writes to storage per tick (DoD). Stop finalizes the open
 * shift's end and persists.
 *
 * `elapsedSeconds` is **active** time — Pause/Resume freezes it. On Stop, the
 * paused span (gross shift duration minus active time) is added to the entry's
 * `breakMinutes`, so a paused lunch becomes a deducted break (SPEC §3.2A).
 *
 * Midnight: a running shift that crosses midnight is flagged on the note.
 * TODO (§6.1.1): full split into two day-entries — deferred; the duration is
 * correct regardless since it's computed from UTC instants.
 *
 * @param opts.now injectable clock for tests/determinism (default: real time).
 */
export function useClock(opts?: { zone?: string; now?: () => DateTime }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const zone = opts?.zone ?? DEFAULT_ZONE;
  const now = useCallback(() => (opts?.now ? opts.now() : DateTime.now().setZone(zone)), [opts, zone]);

  const [runningId, setRunningId] = useState<ID | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const startRef = useRef<DateTime | null>(null); // the shift's start instant
  const activeBaseRef = useRef(0); // active seconds accumulated before the current segment
  const segmentStartRef = useRef<DateTime | null>(null); // start of the current active segment
  const isRunning = runningId !== null;

  /** Active seconds right now: accumulated base + the open segment (if any). */
  const activeNow = useCallback((at: DateTime): number => {
    const base = activeBaseRef.current;
    if (segmentStartRef.current === null) return base;
    return base + Math.max(0, Math.floor(at.diff(segmentStartRef.current, 'seconds').seconds));
  }, []);

  // 1-second ticker — UI state only, no storage writes. Stops while paused.
  useEffect(() => {
    if (!isRunning || isPaused) return;
    const interval = setInterval(() => setElapsedSeconds(activeNow(now())), 1000);
    return () => clearInterval(interval);
  }, [isRunning, isPaused, now, activeNow]);

  const invalidateMonth = (date: string) =>
    queryClient.invalidateQueries({ queryKey: entriesKey(date.slice(0, 7)) });

  async function start(): Promise<void> {
    if (isRunning) return;
    const startAt = now();
    const today = startAt.toISODate()!;
    startRef.current = startAt;
    segmentStartRef.current = startAt;
    activeBaseRef.current = 0;

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
    setIsPaused(false);
    setElapsedSeconds(0);
  }

  /** Pause the active segment, banking its seconds into the active base. */
  function pause(): void {
    if (!isRunning || isPaused || segmentStartRef.current === null) return;
    activeBaseRef.current = activeNow(now());
    segmentStartRef.current = null;
    setIsPaused(true);
    setElapsedSeconds(activeBaseRef.current);
  }

  /** Resume: open a new active segment from now. */
  function resume(): void {
    if (!isRunning || !isPaused) return;
    segmentStartRef.current = now();
    setIsPaused(false);
  }

  async function stop(): Promise<void> {
    if (runningId === null) return;
    const endAt = now();
    const startAt = startRef.current;
    const activeSeconds = activeNow(endAt);

    const entry = await repository.getEntry(runningId);
    if (entry) {
      const crossedMidnight = startAt !== null && startAt.toISODate() !== endAt.toISODate();
      const grossSeconds = startAt ? Math.max(0, endAt.diff(startAt, 'seconds').seconds) : activeSeconds;
      const pauseMinutes = Math.round(Math.max(0, grossSeconds - activeSeconds) / 60);

      const shifts = entry.shifts.map((s) =>
        s.end === null ? { ...s, end: endAt.toUTC().toISO()! } : s,
      );
      const updated: TimeEntry = {
        ...entry,
        shifts,
        breakMinutes: entry.breakMinutes + pauseMinutes,
        note: crossedMidnight ? appendFlag(entry.note, 'midnight') : entry.note,
      };
      await repository.upsertEntry(updated);
      void invalidateMonth(entry.date);
    }

    startRef.current = null;
    segmentStartRef.current = null;
    activeBaseRef.current = 0;
    setRunningId(null);
    setIsPaused(false);
    setElapsedSeconds(0);
  }

  return { isRunning, isPaused, elapsedSeconds, start, pause, resume, stop };
}

function appendFlag(note: string | undefined, flag: string): string {
  const marker = `[${flag}]`;
  if (note && note.includes(marker)) return note;
  return note ? `${note} ${marker}` : marker;
}

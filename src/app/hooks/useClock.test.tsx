import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DateTime } from 'luxon';
import { useClock } from './useClock.ts';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';

const ZONE = 'Asia/Jerusalem';

describe('useClock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('persists on start, ticks without writing, persists on stop', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    const upsertSpy = vi.spyOn(repo, 'upsertEntry');

    let current = DateTime.fromISO('2026-06-21T08:00:00', { zone: ZONE });
    const { result } = renderHook(() => useClock({ zone: ZONE, now: () => current }), {
      wrapper: createWrapper(repo),
    });

    // Start → one write, an open shift persisted.
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isRunning).toBe(true);
    expect(upsertSpy).toHaveBeenCalledTimes(1);

    const afterStart = await repo.listEntries({ from: '2026-06-21', to: '2026-06-21' });
    expect(afterStart).toHaveLength(1);
    expect(afterStart[0].shifts[0].end).toBeNull();

    // Tick 5 seconds → elapsed updates, NO extra writes.
    await act(async () => {
      current = current.plus({ seconds: 5 });
      vi.advanceTimersByTime(5000);
    });
    expect(upsertSpy).toHaveBeenCalledTimes(1); // ticker never writes
    expect(result.current.elapsedSeconds).toBe(5);

    // Stop → one more write, the open shift gets an end.
    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.isRunning).toBe(false);
    expect(upsertSpy).toHaveBeenCalledTimes(2);

    const afterStop = await repo.listEntries({ from: '2026-06-21', to: '2026-06-21' });
    expect(afterStop[0].shifts[0].end).not.toBeNull();
  });

  it('flags a shift that crosses midnight', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    let current = DateTime.fromISO('2026-06-21T23:59:30', { zone: ZONE });
    const { result } = renderHook(() => useClock({ zone: ZONE, now: () => current }), {
      wrapper: createWrapper(repo),
    });

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      current = DateTime.fromISO('2026-06-22T00:00:30', { zone: ZONE });
      await result.current.stop();
    });

    const entries = await repo.listEntries({ from: '2026-06-21', to: '2026-06-21' });
    expect(entries[0].note).toContain('[midnight]');
  });

  it('banks paused time as a break on stop', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    let current = DateTime.fromISO('2026-06-21T08:00:00', { zone: ZONE });
    const { result } = renderHook(() => useClock({ zone: ZONE, now: () => current }), {
      wrapper: createWrapper(repo),
    });

    await act(async () => {
      await result.current.start();
    });

    // Work 10 active minutes.
    await act(async () => {
      current = current.plus({ minutes: 10 });
      vi.advanceTimersByTime(600_000);
    });
    expect(result.current.elapsedSeconds).toBe(600);

    // Pause 5 minutes — elapsed freezes.
    await act(async () => {
      result.current.pause();
    });
    await act(async () => {
      current = current.plus({ minutes: 5 });
      vi.advanceTimersByTime(300_000);
    });
    expect(result.current.isPaused).toBe(true);
    expect(result.current.elapsedSeconds).toBe(600);

    // Resume, work 5 more active minutes, then stop.
    await act(async () => {
      result.current.resume();
    });
    await act(async () => {
      current = current.plus({ minutes: 5 });
      vi.advanceTimersByTime(300_000);
    });
    await act(async () => {
      await result.current.stop();
    });

    // Gross span 20 min, active 15 min → 5 min banked as break.
    const entries = await repo.listEntries({ from: '2026-06-21', to: '2026-06-21' });
    expect(entries[0].breakMinutes).toBe(5);
  });
});

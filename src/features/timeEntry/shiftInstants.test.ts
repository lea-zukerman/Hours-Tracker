import { describe, it, expect } from 'vitest';
import { buildShift, shiftLocalTimes } from './shiftInstants.ts';
import { netShiftMinutes } from '../../domain/time.ts';

const ZONE = 'Asia/Jerusalem';

describe('buildShift', () => {
  it('builds a same-day shift with the right duration', () => {
    const shift = buildShift('2026-06-10', '09:00', '17:00', ZONE);
    expect(shift.end).not.toBeNull();
    expect(netShiftMinutes(shift, ZONE)).toBe(480); // 8h
  });

  it('rolls the end to the next day when it crosses midnight', () => {
    const shift = buildShift('2026-06-10', '22:00', '02:00', ZONE);
    expect(netShiftMinutes(shift, ZONE)).toBe(240); // 4h across midnight
  });

  it('returns an open shift when the end is empty', () => {
    const shift = buildShift('2026-06-10', '09:00', '', ZONE);
    expect(shift.end).toBeNull();
  });

  it('round-trips through shiftLocalTimes', () => {
    const shift = buildShift('2026-06-10', '09:30', '17:15', ZONE);
    expect(shiftLocalTimes(shift, ZONE)).toEqual({ start: '09:30', end: '17:15' });
  });
});

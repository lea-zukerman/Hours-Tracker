import { describe, it, expect } from 'vitest';
import { netShiftMinutes, autoBreakMinutes } from './time.ts';
import type { Shift } from './types.ts';
import { makeSettings } from '../test/fixtures.ts';

const ZONE = 'Asia/Jerusalem';

const shift = (start: string, end: string | null): Shift => ({ start, end });

describe('netShiftMinutes', () => {
  it('measures a simple same-day shift', () => {
    // 09:00–17:00 local in June (IDT, +3) → 06:00Z–14:00Z = 8h
    expect(netShiftMinutes(shift('2026-06-18T06:00:00.000Z', '2026-06-18T14:00:00.000Z'), ZONE)).toBe(
      480,
    );
  });

  it('handles a shift crossing local midnight', () => {
    // 22:00 → 02:00 next day local (IDT +3) = 19:00Z → 23:00Z = 4h
    expect(netShiftMinutes(shift('2026-06-18T19:00:00.000Z', '2026-06-18T23:00:00.000Z'), ZONE)).toBe(
      240,
    );
  });

  it('handles a DST spring-forward day (23h day) by true elapsed, not wall clock', () => {
    // Israel springs forward 2026-03-27 02:00→03:00. A clock-in at 01:00 IST (+2)
    // and clock-out at 04:00 IDT (+3): wall clock reads 3h, but only 2h elapsed.
    // start 01:00 local = 2026-03-26T23:00Z ; end 04:00 local = 2026-03-27T01:00Z
    expect(netShiftMinutes(shift('2026-03-26T23:00:00.000Z', '2026-03-27T01:00:00.000Z'), ZONE)).toBe(
      120,
    );
  });

  it('handles a DST fall-back day (25h day) by true elapsed, not wall clock', () => {
    // Israel falls back 2026-10-25 02:00→01:00. Clock-in 01:00 IDT (+3),
    // clock-out 02:00 IST (+2): wall clock reads 1h, but 2h elapsed.
    // start 01:00 local = 2026-10-24T22:00Z ; end 02:00 local = 2026-10-25T00:00Z
    expect(netShiftMinutes(shift('2026-10-24T22:00:00.000Z', '2026-10-25T00:00:00.000Z'), ZONE)).toBe(
      120,
    );
  });

  it('returns 0 when out equals in', () => {
    expect(netShiftMinutes(shift('2026-06-18T08:00:00.000Z', '2026-06-18T08:00:00.000Z'), ZONE)).toBe(
      0,
    );
  });

  it('returns 0 for an open shift (running clock)', () => {
    expect(netShiftMinutes(shift('2026-06-18T08:00:00.000Z', null), ZONE)).toBe(0);
  });

  it('is zone-independent: same UTC instants yield the same duration (travel)', () => {
    const s = shift('2026-06-18T06:00:00.000Z', '2026-06-18T14:00:00.000Z');
    expect(netShiftMinutes(s, 'Asia/Jerusalem')).toBe(netShiftMinutes(s, 'America/New_York'));
  });
});

describe('autoBreakMinutes', () => {
  it('returns 0 when auto-break is disabled', () => {
    const settings = makeSettings({ autoBreakEnabled: false });
    expect(autoBreakMinutes(600, settings)).toBe(0);
  });

  it('returns 0 when presence is at or under the threshold', () => {
    const settings = makeSettings({
      autoBreakEnabled: true,
      autoBreakThresholdMinutes: 360,
      autoBreakDeductMinutes: 30,
    });
    expect(autoBreakMinutes(360, settings)).toBe(0); // exactly at threshold
    expect(autoBreakMinutes(300, settings)).toBe(0); // under
  });

  it('deducts the configured amount when presence is over the threshold', () => {
    const settings = makeSettings({
      autoBreakEnabled: true,
      autoBreakThresholdMinutes: 360,
      autoBreakDeductMinutes: 30,
    });
    expect(autoBreakMinutes(361, settings)).toBe(30);
    expect(autoBreakMinutes(600, settings)).toBe(30);
  });
});

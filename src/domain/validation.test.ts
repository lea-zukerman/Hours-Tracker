import { describe, it, expect } from 'vitest';
import { validateEntry } from './validation.ts';
import { makeEntry, makeShift } from '../test/fixtures.ts';
import type { ValidationCode } from './types.ts';

const ZONE = 'Asia/Jerusalem';
const NOW = '2026-06-21T12:00:00.000Z'; // fixed "now" for deterministic future checks

const codes = (entry: Parameters<typeof validateEntry>[0]) =>
  validateEntry(entry, ZONE, NOW).issues.map((i) => i.code);

describe('validateEntry', () => {
  it('accepts a valid past entry', () => {
    const entry = makeEntry({
      date: '2026-06-18',
      shifts: [makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T14:00:00.000Z')],
      breakMinutes: 30,
    });
    const result = validateEntry(entry, ZONE, NOW);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('flags out before in', () => {
    const entry = makeEntry({
      shifts: [makeShift('2026-06-18T14:00:00.000Z', '2026-06-18T06:00:00.000Z')],
    });
    expect(codes(entry)).toContain<ValidationCode>('out_before_in');
  });

  it('flags a break longer than presence', () => {
    const entry = makeEntry({
      shifts: [makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T10:00:00.000Z')], // 240 presence
      breakMinutes: 300,
    });
    expect(codes(entry)).toContain<ValidationCode>('break_exceeds_presence');
  });

  it('flags a clock-out with no clock-in', () => {
    const entry = makeEntry({ shifts: [makeShift('', '2026-06-18T14:00:00.000Z')] });
    expect(codes(entry)).toContain<ValidationCode>('clock_out_without_in');
  });

  it('flags invalid input (e.g. 25:00)', () => {
    const entry = makeEntry({
      shifts: [makeShift('2026-06-18T25:00:00.000Z', '2026-06-18T26:00:00.000Z')],
    });
    expect(codes(entry)).toContain<ValidationCode>('invalid_input');
  });

  it('flags a negative break as invalid input', () => {
    const entry = makeEntry({
      shifts: [makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T10:00:00.000Z')],
      breakMinutes: -5,
    });
    expect(codes(entry)).toContain<ValidationCode>('invalid_input');
  });

  it('flags overlapping shifts', () => {
    const entry = makeEntry({
      shifts: [
        makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T11:00:00.000Z'),
        makeShift('2026-06-18T10:00:00.000Z', '2026-06-18T14:00:00.000Z'), // overlaps the first
      ],
    });
    expect(codes(entry)).toContain<ValidationCode>('overlapping_shifts');
  });

  it('blocks worked hours in the future', () => {
    const entry = makeEntry({
      date: '2026-06-25',
      shifts: [makeShift('2026-06-25T06:00:00.000Z', '2026-06-25T14:00:00.000Z')], // after NOW
    });
    expect(codes(entry)).toContain<ValidationCode>('future_worked_hours');
  });
});

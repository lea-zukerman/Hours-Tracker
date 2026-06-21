import { describe, it, expect } from 'vitest';
import { entryWorkedMinutes } from './time.ts';
import { makeSettings, makeEntry, makeShift } from '../test/fixtures.ts';

const ZONE = 'Asia/Jerusalem';

describe('entryWorkedMinutes', () => {
  it('single shift: net = shift duration', () => {
    const entry = makeEntry({
      shifts: [makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T14:00:00.000Z')], // 8h
    });
    expect(entryWorkedMinutes(entry, makeSettings(), ZONE)).toBe(480);
  });

  it('multiple shifts: net = sum of durations', () => {
    const entry = makeEntry({
      shifts: [
        makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T10:00:00.000Z'), // 4h
        makeShift('2026-06-18T11:00:00.000Z', '2026-06-18T14:00:00.000Z'), // 3h
      ],
    });
    expect(entryWorkedMinutes(entry, makeSettings(), ZONE)).toBe(420);
  });

  it('manual-only entry: returns manualMinutes, ignoring shifts/breaks', () => {
    const entry = makeEntry({ manualMinutes: 500, breakMinutes: 30, shifts: [] });
    expect(entryWorkedMinutes(entry, makeSettings(), ZONE)).toBe(500);
  });

  it('deducts manual break + auto-break from presence', () => {
    const entry = makeEntry({
      shifts: [makeShift('2026-06-18T05:00:00.000Z', '2026-06-18T14:00:00.000Z')], // 9h = 540 presence
      breakMinutes: 20, // manual break
    });
    const settings = makeSettings({
      autoBreakEnabled: true,
      autoBreakThresholdMinutes: 360, // 6h → presence 540 > 360, auto-break applies
      autoBreakDeductMinutes: 30,
    });
    // 540 - 20 (manual) - 30 (auto) = 490
    expect(entryWorkedMinutes(entry, settings, ZONE)).toBe(490);
  });
});

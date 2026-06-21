import { describe, it, expect } from 'vitest';
import { balanceMinutes, monthStatus } from './calculations.ts';

const QUOTA = 10920; // 182h

describe('balanceMinutes + monthStatus', () => {
  it('surplus: credited above quota → positive balance', () => {
    const balance = balanceMinutes(11000, QUOTA);
    expect(balance).toBe(80);
    expect(monthStatus(balance)).toBe('surplus');
  });

  it('deficit: credited below quota → negative balance', () => {
    const balance = balanceMinutes(10000, QUOTA);
    expect(balance).toBe(-920);
    expect(monthStatus(balance)).toBe('deficit');
  });

  it('exactly zero: credited equals quota → on_track', () => {
    const balance = balanceMinutes(QUOTA, QUOTA);
    expect(balance).toBe(0);
    expect(monthStatus(balance)).toBe('on_track');
  });

  it('full-month paid absence → balance 0 (SPEC §6.4.24)', () => {
    // The whole quota credited via absences, zero worked.
    const credited = 0 + QUOTA;
    const balance = balanceMinutes(credited, QUOTA);
    expect(balance).toBe(0);
    expect(monthStatus(balance)).toBe('on_track');
  });

  it('surplus does NOT roll over: each month computed standalone (SPEC §6.4.22)', () => {
    // A prior surplus is irrelevant — the function only sees this month's args.
    const monthA = balanceMinutes(QUOTA + 600, QUOTA); // +600 surplus
    const monthB = balanceMinutes(QUOTA - 300, QUOTA); // -300 deficit, unaffected by month A
    expect(monthA).toBe(600);
    expect(monthB).toBe(-300);
  });
});

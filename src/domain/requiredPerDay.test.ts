import { describe, it, expect } from 'vitest';
import { requiredPerDay } from './calculations.ts';

describe('requiredPerDay', () => {
  it('normal: splits the deficit across the remaining days (rounded)', () => {
    // Deficit 38:40 = 2320 min over 6 days → 386.67 → 387 (≈ 6:27/day), per UC-2.
    expect(requiredPerDay(-2320, 6)).toBe(387);
  });

  it('0 remaining days + deficit → null (cannot complete)', () => {
    expect(requiredPerDay(-100, 0)).toBeNull();
  });

  it('surplus → 0 (nothing required)', () => {
    expect(requiredPerDay(500, 5)).toBe(0);
  });

  it('exactly met (balance 0) → 0', () => {
    expect(requiredPerDay(0, 5)).toBe(0);
  });

  it('surplus with 0 remaining days → 0, not null', () => {
    expect(requiredPerDay(300, 0)).toBe(0);
  });
});

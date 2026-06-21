import { describe, it, expect } from 'vitest';
import { absenceBalance } from '../absences.ts';

describe('absenceBalance', () => {
  it('accrues over months', () => {
    // opening 5 + 1.5/mo × 4 months − 0 used = 11
    expect(absenceBalance(5, 1.5, 4, 0)).toBe(11);
  });

  it('goes negative when usage exceeds the balance (overage flag)', () => {
    // opening 2 + 1 × 1 − 10 used = −7  → balance < 0 signals overage
    const balance = absenceBalance(2, 1, 1, 10);
    expect(balance).toBe(-7);
    expect(balance < 0).toBe(true);
  });

  it('handles zero accrual (no accrual employee)', () => {
    // opening 10 + 0 × 12 − 3 = 7
    expect(absenceBalance(10, 0, 12, 3)).toBe(7);
  });
});

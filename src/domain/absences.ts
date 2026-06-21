/**
 * Accrued absence balance, in days (DESIGN.md §6, absences.ts; SPEC §3.6).
 *
 * balance = opening + accrualPerMonth × monthsElapsed − used
 *
 * Fractional days are expected (accrual is often 1.5/month). A negative
 * result means usage exceeded what was accrued — the "quota overage" flag
 * (SPEC §6.4.25); callers (alerts, 8.2) treat balance < 0 as the warning,
 * so no separate flag is needed.
 */
export function absenceBalance(
  opening: number,
  accrualPerMonth: number,
  monthsElapsed: number,
  used: number,
): number {
  return opening + accrualPerMonth * monthsElapsed - used;
}

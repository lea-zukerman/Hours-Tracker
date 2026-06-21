import { useQuery } from '@tanstack/react-query';
import { absenceBalance, absenceDaysUsed } from '../../domain/absences.ts';
import { useRepository } from '../state/RepositoryContext.tsx';
import { useSettings } from './useSettings.ts';

export const absenceBalancesKey = (month: string) => ['absence-balances', month] as const;

/**
 * Accrued vacation/sick balances as of `month` (DESIGN.md §7; SPEC §3.6).
 *
 * balance = opening + accrual × monthsElapsed − usedYearToDate (absenceBalance).
 *
 * ASSUMPTION (MVP, documented like the pro-rata TODO in calculations.ts): the
 * accrual period is the **current calendar year** — monthsElapsed = the month's
 * number (Jan=1 … Dec=12), and "used" is summed from Jan 1 to month end. The
 * data model has no explicit tracking-start date; when one is added to Settings,
 * compute monthsElapsed and the YTD window from it instead.
 */
export function useAbsenceBalances(month: string) {
  const repository = useRepository();
  const { settings } = useSettings();

  const year = month.slice(0, 4);
  const ytdRange = { from: `${year}-01-01`, to: `${month}-31` };

  const query = useQuery({
    queryKey: absenceBalancesKey(month),
    queryFn: () => repository.listAbsences(ytdRange),
  });

  if (!settings) {
    return { vacation: undefined, sick: undefined, isLoading: true };
  }

  const ytd = query.data ?? [];
  const monthsElapsed = Number(month.slice(5, 7)); // 1..12, calendar-year basis
  const window = { from: ytdRange.from, to: ytdRange.to };

  const vacationUsed = absenceDaysUsed(ytd, 'vacation', settings, window);
  const sickUsed = absenceDaysUsed(ytd, 'sick', settings, window);

  return {
    vacation: absenceBalance(
      settings.vacationOpeningBalance,
      settings.vacationAccrualPerMonth,
      monthsElapsed,
      vacationUsed,
    ),
    sick: absenceBalance(
      settings.sickOpeningBalance,
      settings.sickAccrualPerMonth,
      monthsElapsed,
      sickUsed,
    ),
    isLoading: query.isLoading,
  };
}

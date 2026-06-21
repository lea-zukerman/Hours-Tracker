import { useMemo } from 'react';
import { DateTime } from 'luxon';
import type { IsoDate } from '../../domain/types.ts';
import { deriveAlerts, type ActiveAlert } from '../../domain/alerts.ts';
import { useMonthSummary } from './useMonthSummary.ts';
import { useSettings } from './useSettings.ts';
import { useTimeEntries } from './useTimeEntries.ts';
import { useAbsences } from './useAbsences.ts';
import { useAbsenceBalances } from './useAbsenceBalances.ts';

const DEFAULT_ZONE = 'Asia/Jerusalem';

/**
 * Active alerts for a month (DESIGN.md §7). Assembles the AlertContext from the
 * existing hooks and runs the pure deriveAlerts (T4). Recomputes whenever any
 * input changes, so editing/deleting data updates the banner immediately
 * (SPEC §6.5.29).
 */
export function useAlerts(
  month: string,
  opts?: { today?: IsoDate; zone?: string },
): ActiveAlert[] {
  const zone = opts?.zone ?? DEFAULT_ZONE;
  const today = opts?.today ?? DateTime.now().setZone(zone).toISODate()!;

  const { summary } = useMonthSummary(month, { today, zone });
  const { settings } = useSettings();
  const { entries } = useTimeEntries(month);
  const { absences } = useAbsences(month);
  const { vacation, sick } = useAbsenceBalances(month);

  return useMemo(() => {
    if (!summary || !settings) return [];
    return deriveAlerts({
      summary,
      settings,
      entries,
      absences,
      today,
      zone,
      vacationBalanceDays: vacation ?? 0,
      sickBalanceDays: sick ?? 0,
    });
  }, [summary, settings, entries, absences, today, zone, vacation, sick]);
}

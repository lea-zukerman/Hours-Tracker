import { useMemo } from 'react';
import { DateTime } from 'luxon';
import type { IsoDate, MonthSummary } from '../../domain/types.ts';
import { buildMonthSummary } from '../../domain/calculations.ts';
import { useSettings } from './useSettings.ts';
import { useTimeEntries } from './useTimeEntries.ts';
import { useAbsences } from './useAbsences.ts';

// Product is Israel-focused; until a per-user timezone is wired (from User),
// default to this zone. Overridable for tests and future use.
const DEFAULT_ZONE = 'Asia/Jerusalem';

/**
 * Compose a month's entries + absences + settings into a MonthSummary
 * (DESIGN.md §7; orchestrates 1.12). Recomputes immediately when any input
 * changes — edits/deletes invalidate the entry/absence queries, the data
 * reference changes, and this memo re-runs (DoD).
 */
export function useMonthSummary(
  month: string,
  opts?: { today?: IsoDate; zone?: string },
): { summary: MonthSummary | undefined; isLoading: boolean } {
  const zone = opts?.zone ?? DEFAULT_ZONE;
  const today = opts?.today ?? DateTime.now().setZone(zone).toISODate()!;

  const { settings, isLoading: settingsLoading } = useSettings();
  const { entries, isLoading: entriesLoading } = useTimeEntries(month);
  const { absences, isLoading: absencesLoading } = useAbsences(month);

  const summary = useMemo(() => {
    if (!settings) return undefined;
    return buildMonthSummary({ month, today, zone, settings, entries, absences });
  }, [month, today, zone, settings, entries, absences]);

  return {
    summary,
    isLoading: settingsLoading || entriesLoading || absencesLoading || !settings,
  };
}

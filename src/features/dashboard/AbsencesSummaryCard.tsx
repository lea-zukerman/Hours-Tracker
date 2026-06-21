import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { absenceDaysUsed } from '../../domain/absences.ts';
import { useSettings } from '../../app/hooks/useSettings.ts';
import { useAbsences } from '../../app/hooks/useAbsences.ts';
import { useAbsenceBalances } from '../../app/hooks/useAbsenceBalances.ts';
import { monthRange } from '../../app/hooks/monthRange.ts';

/** Days as a short label: integers plain, fractions to one decimal (e.g. 1.5). */
function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Absences at a glance (DESIGN.md §8; SPEC §3.1.3): vacation/sick used this
 * month alongside the remaining accrued balance, plus holiday days and a quick
 * link to report an absence. The report flow itself is T10 — the link shows
 * only when an `onReport` handler is wired.
 */
export function AbsencesSummaryCard({
  month,
  onReport,
}: {
  month: string;
  onReport?: () => void;
}) {
  const { settings } = useSettings();
  const { absences } = useAbsences(month);
  const { vacation, sick } = useAbsenceBalances(month);

  if (!settings) return <Card title="היעדרויות">…</Card>;

  const window = monthRange(month);
  const vacationUsed = absenceDaysUsed(absences, 'vacation', settings, window);
  const sickUsed = absenceDaysUsed(absences, 'sick', settings, window);
  const holidayUsed = absenceDaysUsed(absences, 'holiday', settings, window);

  return (
    <Card title="היעדרויות">
      <div className="absences">
        <div className="absences__row">
          <span className="label">חופשה החודש</span>
          <span className="num">{formatDays(vacationUsed)}</span>
          {vacation !== undefined && (
            <span className="absences__balance">יתרה: {formatDays(vacation)}</span>
          )}
        </div>
        <div className="absences__row">
          <span className="label">מחלה החודש</span>
          <span className="num">{formatDays(sickUsed)}</span>
          {sick !== undefined && (
            <span className="absences__balance">יתרה: {formatDays(sick)}</span>
          )}
        </div>
        <div className="absences__row">
          <span className="label">חג החודש</span>
          <span className="num">{formatDays(holidayUsed)}</span>
        </div>

        {onReport && (
          <Button variant="ghost" onClick={onReport}>
            דווח היעדרות
          </Button>
        )}
      </div>
    </Card>
  );
}

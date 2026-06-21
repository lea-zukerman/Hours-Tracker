import { useState } from 'react';
import { DateTime } from 'luxon';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { useTimeEntries } from '../../app/hooks/useTimeEntries.ts';
import { useAbsences } from '../../app/hooks/useAbsences.ts';
import { useClock } from '../../app/hooks/useClock.ts';
import { ManualEntryForm } from '../timeEntry/ManualEntryForm.tsx';
import { TodayCard } from './TodayCard.tsx';
import { MonthCard } from './MonthCard.tsx';
import { AbsencesSummaryCard } from './AbsencesSummaryCard.tsx';

const DEFAULT_ZONE = 'Asia/Jerusalem';

/**
 * First-run empty state (DESIGN.md §8; SPEC §3.1): no data yet → a single call
 * to action. "Start logging" starts the live clock (useClock), which persists
 * an open shift; the dashboard then has data and shows the cards.
 */
function EmptyState({ zone }: { zone: string }) {
  const { start } = useClock({ zone });
  return (
    <Card>
      <div className="empty">
        <p className="empty__msg">עדיין אין נתונים החודש.</p>
        <Button onClick={() => void start()}>▶ התחל לתעד</Button>
      </div>
    </Card>
  );
}

/**
 * The main dashboard (DESIGN.md §8; SPEC §3.1): Today, This Month and Absences
 * cards, with a manual-entry form toggled on demand (T9). With no entries and
 * no absences for the month it shows the empty state. Alerts banner is T12;
 * report-absence flow is T10.
 *
 * `today`/`zone` are injectable for deterministic tests.
 */
export function DashboardPage({
  today,
  zone = DEFAULT_ZONE,
}: {
  today?: string;
  zone?: string;
}) {
  const resolvedToday = today ?? DateTime.now().setZone(zone).toISODate()!;
  const month = resolvedToday.slice(0, 7);

  const { entries, isLoading: entriesLoading } = useTimeEntries(month);
  const { absences, isLoading: absencesLoading } = useAbsences(month);
  const [showForm, setShowForm] = useState(false);

  if (entriesLoading || absencesLoading) {
    return <p className="dashboard__loading">טוען…</p>;
  }

  const empty = entries.length === 0 && absences.length === 0;

  return (
    <div className="dashboard-page">
      <div className="dashboard__actions">
        <Button variant="ghost" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'סגור' : '➕ הוספה ידנית'}
        </Button>
      </div>

      {showForm && (
        <ManualEntryForm date={resolvedToday} zone={zone} onClose={() => setShowForm(false)} />
      )}

      {empty ? (
        <EmptyState zone={zone} />
      ) : (
        <div className="dashboard">
          <TodayCard zone={zone} today={resolvedToday} />
          <MonthCard month={month} today={resolvedToday} zone={zone} />
          <AbsencesSummaryCard month={month} />
        </div>
      )}
    </div>
  );
}

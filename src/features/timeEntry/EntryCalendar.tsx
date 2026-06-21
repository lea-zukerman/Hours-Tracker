import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { he } from 'react-day-picker/locale';
import { DateTime } from 'luxon';
import type { Absence, IsoDate } from '../../domain/types.ts';
import { useTimeEntries } from '../../app/hooks/useTimeEntries.ts';
import { useAbsences } from '../../app/hooks/useAbsences.ts';

const toJs = (iso: string) => DateTime.fromISO(iso).toJSDate();

/** JS Dates for every in-month day of the absences matching `pred`. */
function expandDays(absences: Absence[], pred: (a: Absence) => boolean, month: string): Date[] {
  const out: Date[] = [];
  for (const a of absences) {
    if (!pred(a)) continue;
    let cursor = DateTime.fromISO(a.dateFrom);
    const end = DateTime.fromISO(a.dateTo);
    if (!cursor.isValid || !end.isValid) continue;
    while (cursor <= end) {
      if (cursor.toFormat('yyyy-MM') === month) out.push(cursor.toJSDate());
      cursor = cursor.plus({ days: 1 });
    }
  }
  return out;
}

/**
 * Inline month calendar for the manual-entry flow (frontend-design skill;
 * SPEC §3.2/§3.5). Opens immediately and marks each day by state — worked,
 * vacation, sick, other absence — so the month is readable at a glance.
 * Clicking a day selects it for filling/editing. Markers follow the displayed
 * month as the user navigates.
 */
export function EntryCalendar({
  selected,
  onSelect,
}: {
  selected: IsoDate;
  onSelect: (iso: IsoDate) => void;
}) {
  const [shownMonth, setShownMonth] = useState(selected.slice(0, 7));
  const { entries } = useTimeEntries(shownMonth);
  const { absences } = useAbsences(shownMonth);

  const worked = entries.map((e) => toJs(e.date));
  const vacation = expandDays(absences, (a) => a.type === 'vacation', shownMonth);
  const sick = expandDays(absences, (a) => a.type === 'sick', shownMonth);
  const absence = expandDays(
    absences,
    (a) => a.type === 'holiday' || a.type === 'reserve' || a.type === 'unpaid',
    shownMonth,
  );

  return (
    <div className="cal">
      <DayPicker
        mode="single"
        selected={toJs(selected)}
        month={toJs(`${shownMonth}-01`)}
        onMonthChange={(d) => setShownMonth(DateTime.fromJSDate(d).toFormat('yyyy-MM'))}
        onSelect={(d) => {
          if (d) onSelect(DateTime.fromJSDate(d).toFormat('yyyy-MM-dd'));
        }}
        locale={he}
        dir="rtl"
        modifiers={{ worked, vacation, sick, absence }}
        modifiersClassNames={{
          worked: 'cal-day--worked',
          vacation: 'cal-day--vacation',
          sick: 'cal-day--sick',
          absence: 'cal-day--absence',
        }}
      />

      <ul className="cal__legend">
        <li>
          <span className="cal__dot cal__dot--worked" aria-hidden="true" /> עבודה
        </li>
        <li>
          <span className="cal__dot cal__dot--vacation" aria-hidden="true" /> חופשה
        </li>
        <li>
          <span className="cal__dot cal__dot--sick" aria-hidden="true" /> מחלה
        </li>
        <li>
          <span className="cal__dot cal__dot--absence" aria-hidden="true" /> היעדרות
        </li>
      </ul>
    </div>
  );
}

import { useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { formatDate, formatMinutes } from '../../ui/format.ts';
import { useSettings } from '../../app/hooks/useSettings.ts';
import { useTimeEntries } from '../../app/hooks/useTimeEntries.ts';
import { useAbsences } from '../../app/hooks/useAbsences.ts';
import { useMonthSummary } from '../../app/hooks/useMonthSummary.ts';
import { useRepository } from '../../app/state/RepositoryContext.tsx';
import type { DatasetSnapshot } from '../../data/Repository.ts';
import { buildMonthRows } from './monthRows.ts';
import { toCsv } from './csv.ts';

const DEFAULT_ZONE = 'Asia/Jerusalem';

/** Trigger a browser download of text content. */
function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Reports & export (DESIGN.md §8; SPEC §3.5). A day-by-day month table with
 * month navigation, CSV export (summary included), and full JSON backup/restore
 * — critical because storage is local (SPEC §4.2, §6.5.28).
 */
export function ReportsPage({
  month: initialMonth,
  zone = DEFAULT_ZONE,
}: {
  month?: string;
  zone?: string;
}) {
  const [month, setMonth] = useState(
    initialMonth ?? DateTime.now().setZone(zone).toFormat('yyyy-MM'),
  );

  const { settings } = useSettings();
  const { entries } = useTimeEntries(month);
  const { absences } = useAbsences(month);
  const { summary } = useMonthSummary(month, { zone });
  const repository = useRepository();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const shiftMonth = (delta: number) =>
    setMonth(DateTime.fromISO(`${month}-01`).plus({ months: delta }).toFormat('yyyy-MM'));

  if (!settings || !summary) return <Card title="דוחות">…</Card>;

  const rows = buildMonthRows(month, entries, absences, settings, zone);
  const monthLabel = DateTime.fromISO(`${month}-01`).toFormat('MM/yyyy');

  function exportCsv() {
    if (!summary) return;
    download(`hours-${month}.csv`, toCsv(rows, summary), 'text/csv;charset=utf-8');
  }

  async function exportJson() {
    const snapshot = await repository.exportAll();
    download(`hours-backup-${month}.json`, JSON.stringify(snapshot, null, 2), 'application/json');
  }

  async function importJson(file: File) {
    const snapshot = JSON.parse(await file.text()) as DatasetSnapshot;
    await repository.importAll(snapshot);
    await queryClient.invalidateQueries();
  }

  return (
    <Card title="דוחות">
      <div className="report">
        <div className="report__nav">
          <Button variant="ghost" onClick={() => shiftMonth(-1)}>
            ◀ חודש קודם
          </Button>
          <span className="report__month num">{monthLabel}</span>
          <Button variant="ghost" onClick={() => shiftMonth(1)}>
            חודש הבא ▶
          </Button>
        </div>

        <table className="report__table">
          <thead>
            <tr>
              <th>תאריך</th>
              <th>כניסה</th>
              <th>יציאה</th>
              <th>הפסקה</th>
              <th>נטו</th>
              <th>היעדרות</th>
              <th>הערה</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="report__empty">
                  אין נתונים לחודש זה
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.date}>
                  <td>{formatDate(r.date)}</td>
                  <td className="num">{r.inTime}</td>
                  <td className="num">{r.outTime}</td>
                  <td className="num">{r.breakMinutes || ''}</td>
                  <td className="num">{r.netMinutes ? formatMinutes(r.netMinutes) : ''}</td>
                  <td>{r.absence}</td>
                  <td>{r.note}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>סיכום</td>
              <td className="num">{formatMinutes(summary.creditedMinutes)}</td>
              <td colSpan={2}>
                מתוך {formatMinutes(summary.quotaMinutes)} · מאזן{' '}
                {formatMinutes(summary.balanceMinutes)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="report__actions">
          <Button onClick={exportCsv}>⬇ ייצוא CSV</Button>
          <Button variant="ghost" onClick={() => void exportJson()}>
            ⬇ גיבוי JSON
          </Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            ⬆ שחזור מגיבוי
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importJson(file);
            }}
          />
        </div>

        <p className="report__warning">
          ⚠ הנתונים נשמרים בדפדפן זה בלבד. ניקוי היסטוריית הדפדפן ימחק אותם — מומלץ לגבות מדי פעם.
        </p>
      </div>
    </Card>
  );
}

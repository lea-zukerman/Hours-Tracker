import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { DateTime } from 'luxon';
import { LocalStorageRepository, defaultSettings } from '../data/LocalStorageRepository.ts';
import { buildMonthSummary } from '../domain/calculations.ts';
import { entryWorkedMinutes } from '../domain/time.ts';
import { formatMinutes, formatTime24 } from '../ui/format.ts';
import type { Absence, MonthSummary, Settings, TimeEntry } from '../domain/types.ts';

/**
 * TEMPORARY dev sandbox — NOT a milestone. A throwaway screen that wires the
 * real domain (Milestone 1) + LocalStorageRepository (Milestone 2) to a simple
 * UI so the engine can be exercised by hand before the real dashboard (M4+).
 * Remove when Milestone 4 starts.
 */

const ZONE = 'Asia/Jerusalem';
const repo = new LocalStorageRepository();
const settings: Settings = defaultSettings();

let seq = 0;
const newId = () => `dev-${Date.now()}-${seq++}`;

/**
 * Build the UTC start/end instants for a shift from local wall times in ZONE.
 * If the end is at or before the start, the shift crossed midnight, so the end
 * rolls to the next day — this is what lets a 22:00→02:00 shift be testable
 * here. (The domain already computes correctly from whatever instants it gets.)
 */
function buildShiftInstants(date: string, start: string, end: string) {
  const startDt = DateTime.fromISO(`${date}T${start}`, { zone: ZONE });
  let endDt = DateTime.fromISO(`${date}T${end}`, { zone: ZONE });
  if (endDt <= startDt) endDt = endDt.plus({ days: 1 });
  return { start: startDt.toUTC().toISO()!, end: endDt.toUTC().toISO()! };
}

function statusHe(s: MonthSummary['status']): string {
  return {
    surplus: 'עודף ✅',
    deficit: 'גירעון ⚠️',
    on_track: 'במסלול',
    cannot_complete: 'לא ניתן להשלים ❌',
  }[s];
}

export function DevSandbox() {
  const [today, setToday] = useState('2026-06-21');
  const [date, setDate] = useState('2026-06-21');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [breakMin, setBreakMin] = useState('30');

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);

  const month = today.slice(0, 7);
  const from = `${month}-01`;
  const to = `${month}-31`;

  const refresh = useCallback(async () => {
    setEntries(await repo.listEntries({ from, to }));
    setAbsences(await repo.listAbsences({ from, to }));
  }, [from, to]);

  useEffect(() => {
    // Async load on mount/month-change — setState happens after an await, not
    // synchronously. (Sandbox; the real app uses React Query hooks, M3.)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const summary: MonthSummary = useMemo(
    () => buildMonthSummary({ month, today, zone: ZONE, settings, entries, absences }),
    [month, today, entries, absences],
  );

  async function addShift() {
    const entry: TimeEntry = {
      id: newId(),
      userId: settings.userId,
      date,
      shifts: [buildShiftInstants(date, start, end)],
      breakMinutes: Number(breakMin) || 0,
    };
    await repo.upsertEntry(entry);
    await refresh();
  }

  async function addVacation() {
    const absence: Absence = {
      id: newId(),
      userId: settings.userId,
      dateFrom: date,
      dateTo: date,
      type: 'vacation',
    };
    await repo.upsertAbsence(absence);
    await refresh();
  }

  async function reset() {
    for (const e of entries) await repo.deleteEntry(e.id);
    for (const a of absences) await repo.deleteAbsence(a.id);
    await refresh();
  }

  return (
    <div style={S.page}>
      <div style={S.banner}>
        🔧 מסך בדיקה זמני (Dev Sandbox) — לא חלק מהמוצר. בודק את מנוע החישוב והאחסון
        (Milestones 1–2). יוסר כשנבנה את לוח המחוונים האמיתי.
      </div>

      <section style={S.card}>
        <h2 style={S.h2}>הגדרות (ברירת מחדל)</h2>
        <div style={S.row}>
          <span>מכסה חודשית: <b>{formatMinutes(settings.monthlyQuotaMinutes)}</b></span>
          <span>יעד יומי: <b>{formatMinutes(settings.dailyTargetMinutes)}</b></span>
          <span>ימי עבודה: <b>א׳–ה׳</b></span>
        </div>
        <label style={S.field}>
          "היום" (לחישוב ימים שנותרו):
          <input type="date" value={today} onChange={(e) => setToday(e.target.value)} />
        </label>
      </section>

      <section style={S.card}>
        <h2 style={S.h2}>הוספת משמרת / היעדרות</h2>
        <div style={S.formRow}>
          <label style={S.field}>תאריך<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label style={S.field}>כניסה<input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label style={S.field}>יציאה<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          <label style={S.field}>הפסקה (דק׳)<input type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} style={{ width: 70 }} /></label>
        </div>
        <div style={S.formRow}>
          <button style={S.btn} onClick={() => void addShift()}>➕ הוסף משמרת</button>
          <button style={S.btnAlt} onClick={() => void addVacation()}>🌴 דווח חופשה (יום מלא)</button>
          <button style={S.btnGhost} onClick={() => void reset()}>🗑 איפוס החודש</button>
        </div>
        <p style={S.hint}>טיפ: הוסף משמרת פעמיים לאותו תאריך — שתיהן ימוזגו ליום אחד (merge-by-date).</p>
      </section>

      <section style={S.card}>
        <h2 style={S.h2}>סיכום החודש ({month})</h2>
        <div style={S.grid}>
          <Stat label="עבדת" value={formatMinutes(summary.workedMinutes)} />
          <Stat label="מזוכה (כולל היעדרות)" value={formatMinutes(summary.creditedMinutes)} />
          <Stat label="מכסה" value={formatMinutes(summary.quotaMinutes)} />
          <Stat
            label="מאזן"
            value={formatMinutes(summary.balanceMinutes)}
            color={summary.balanceMinutes < 0 ? '#c0392b' : '#27ae60'}
          />
          <Stat label="ימי עבודה שנותרו" value={String(summary.remainingWorkdays)} />
          <Stat
            label="נדרש ליום"
            value={summary.requiredPerDayMinutes === null ? '—' : formatMinutes(summary.requiredPerDayMinutes)}
          />
          <Stat label="סטטוס" value={statusHe(summary.status)} />
        </div>
      </section>

      <section style={S.card}>
        <h2 style={S.h2}>רשומות החודש ({entries.length})</h2>
        {entries.length === 0 && <p style={S.hint}>אין רשומות. הוסף משמרת למעלה.</p>}
        {entries.map((e) => (
          <div key={e.id} style={S.entry}>
            <b>{e.date}</b>
            <span>
              {e.shifts.map((s, i) => (
                <span key={i} style={S.chip}>
                  {formatTime24(s.start, ZONE)}–{s.end ? formatTime24(s.end, ZONE) : '⏱'}
                </span>
              ))}
            </span>
            <span>הפסקה {e.breakMinutes}׳</span>
            <span>נטו: <b>{formatMinutes(entryWorkedMinutes(e, settings, ZONE))}</b></span>
          </div>
        ))}
        {absences.length > 0 && (
          <p style={S.hint}>היעדרויות: {absences.map((a) => `${a.type} ${a.dateFrom}`).join(' · ')}</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={S.stat}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ ...S.statValue, color }}>{value}</div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { maxWidth: 820, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' },
  banner: { background: '#fff3cd', border: '1px solid #ffe69c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14 },
  card: { background: '#fff', border: '1px solid #e3e3e3', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.05)' },
  h2: { margin: '0 0 12px', fontSize: 18 },
  row: { display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 },
  formRow: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 },
  btn: { background: '#2d6cdf', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14 },
  btnAlt: { background: '#27ae60', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14 },
  btnGhost: { background: '#f1f1f1', color: '#333', border: 0, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14 },
  hint: { fontSize: 13, color: '#777', margin: '6px 0 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  stat: { background: '#fafafa', borderRadius: 8, padding: 12, textAlign: 'center' },
  statLabel: { fontSize: 12, color: '#888', marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: 700 },
  entry: { display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid #eee', fontSize: 14 },
  chip: { background: '#eef3ff', borderRadius: 6, padding: '2px 8px', marginInlineEnd: 6 },
};

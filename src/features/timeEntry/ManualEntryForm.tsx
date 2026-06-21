import { useEffect, useState } from 'react';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import type { IsoDate, TimeEntry } from '../../domain/types.ts';
import { validateEntry } from '../../domain/validation.ts';
import { useSettings } from '../../app/hooks/useSettings.ts';
import { useTimeEntries } from '../../app/hooks/useTimeEntries.ts';
import { LOCAL_USER_ID } from '../../data/LocalStorageRepository.ts';
import { buildShift, shiftLocalTimes } from './shiftInstants.ts';
import { validationMessage } from './messages.ts';
import { EntryCalendar } from './EntryCalendar.tsx';
import { ReportAbsenceForm } from '../absences/ReportAbsenceForm.tsx';

const DEFAULT_ZONE = 'Asia/Jerusalem';

type Mode = 'shifts' | 'total';
type Kind = 'hours' | 'absence';
interface Row {
  start: string;
  end: string;
}

/**
 * Manual time entry (DESIGN.md §8; SPEC §3.2B/C). Edits the one entry for the
 * chosen day (load-prefill-save by the same id → a clean edit, no shift
 * duplication). Two modes: explicit shifts (multiple in/out pairs) or a bare
 * total-hours number. Validation is live (validateEntry → Hebrew via messages);
 * Save is blocked while invalid. Delete removes the day's entry.
 */
export function ManualEntryForm({
  date: initialDate,
  zone = DEFAULT_ZONE,
  onClose,
  initialKind = 'hours',
}: {
  date: IsoDate;
  zone?: string;
  onClose?: () => void;
  initialKind?: Kind;
}) {
  const { settings } = useSettings();
  const [date, setDate] = useState(initialDate);
  const month = date.slice(0, 7);
  const { entries, upsertEntry, deleteEntry } = useTimeEntries(month);
  const existing = entries.find((e) => e.date === date);

  const [kind, setKind] = useState<Kind>(initialKind);
  const [mode, setMode] = useState<Mode>('shifts');
  const [rows, setRows] = useState<Row[]>([{ start: '', end: '' }]);
  const [breakStr, setBreakStr] = useState('0');
  const [totalStr, setTotalStr] = useState('');
  const [note, setNote] = useState('');
  const [loadedKey, setLoadedKey] = useState('');

  // Prefill from the day's existing entry (or reset) when the target changes —
  // syncing form state to async-loaded data, so a re-render with new data wins.
  const targetKey = `${date}:${existing?.id ?? 'new'}`;
  useEffect(() => {
    if (targetKey === loadedKey) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (existing && existing.manualMinutes !== undefined) {
      setMode('total');
      setTotalStr(String(existing.manualMinutes / 60));
      setRows([{ start: '', end: '' }]);
    } else if (existing) {
      setMode('shifts');
      setRows(
        existing.shifts.length
          ? existing.shifts.map((s) => shiftLocalTimes(s, zone))
          : [{ start: '', end: '' }],
      );
      setTotalStr('');
    } else {
      setMode('shifts');
      setRows([{ start: '', end: '' }]);
      setTotalStr('');
    }
    setBreakStr(String(existing?.breakMinutes ?? 0));
    setNote(existing?.note ?? '');
    setLoadedKey(targetKey);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [targetKey, loadedKey, existing, zone]);

  if (!settings) return <Card title="דיווח ידני">…</Card>;

  function buildEntry(): TimeEntry {
    const base = {
      id: existing?.id ?? crypto.randomUUID(),
      userId: LOCAL_USER_ID,
      date,
      note: note.trim() ? note.trim() : undefined,
    };
    if (mode === 'total') {
      const hours = parseFloat(totalStr);
      return {
        ...base,
        shifts: [],
        breakMinutes: 0,
        manualMinutes: Number.isFinite(hours) ? Math.round(hours * 60) : NaN,
      };
    }
    const shifts = rows
      .filter((r) => r.start !== '' || r.end !== '')
      .map((r) => buildShift(date, r.start, r.end, zone));
    const breakMinutes = Number(breakStr);
    return { ...base, shifts, breakMinutes: Number.isFinite(breakMinutes) ? breakMinutes : NaN };
  }

  const candidate = buildEntry();
  const result = validateEntry(candidate, zone);
  const messages = [...new Set(result.issues.map((i) => validationMessage[i.code]))];

  async function save() {
    if (!result.valid) return;
    await upsertEntry(candidate);
    onClose?.();
  }

  async function remove() {
    if (!existing) return;
    await deleteEntry(existing.id);
    onClose?.();
  }

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Card title="דיווח ידני">
      <div className="te-form">
        <div className="te-field">
          <span className="label">בחר/י יום</span>
          <EntryCalendar selected={date} onSelect={setDate} />
        </div>

        <div className="te-modes" role="group" aria-label="סוג דיווח">
          <Button variant={kind === 'hours' ? 'primary' : 'ghost'} onClick={() => setKind('hours')}>
            דיווח שעות
          </Button>
          <Button variant={kind === 'absence' ? 'primary' : 'ghost'} onClick={() => setKind('absence')}>
            🌴 דיווח היעדרות
          </Button>
        </div>

        {kind === 'absence' ? (
          <ReportAbsenceForm bare date={date} month={month} onClose={onClose} />
        ) : (
          <>
        <div className="te-modes" role="group" aria-label="אופן הדיווח">
          <Button variant={mode === 'shifts' ? 'primary' : 'ghost'} onClick={() => setMode('shifts')}>
            לפי שעות
          </Button>
          <Button variant={mode === 'total' ? 'primary' : 'ghost'} onClick={() => setMode('total')}>
            סה״כ שעות
          </Button>
        </div>

        {mode === 'shifts' ? (
          <>
            {rows.map((row, i) => (
              <div className="te-row" key={i}>
                <label className="te-field">
                  כניסה
                  <input
                    type="time"
                    value={row.start}
                    onChange={(e) => setRow(i, { start: e.target.value })}
                  />
                </label>
                <label className="te-field">
                  יציאה
                  <input
                    type="time"
                    value={row.end}
                    onChange={(e) => setRow(i, { end: e.target.value })}
                  />
                </label>
                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    aria-label="הסר משמרת"
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  >
                    ✕
                  </Button>
                )}
              </div>
            ))}
            <Button variant="ghost" onClick={() => setRows((rs) => [...rs, { start: '', end: '' }])}>
              ➕ משמרת
            </Button>
            <label className="te-field">
              הפסקה (דקות)
              <input
                type="number"
                min="0"
                value={breakStr}
                onChange={(e) => setBreakStr(e.target.value)}
              />
            </label>
          </>
        ) : (
          <label className="te-field">
            סה״כ שעות
            <input
              type="number"
              min="0"
              step="0.25"
              value={totalStr}
              onChange={(e) => setTotalStr(e.target.value)}
            />
          </label>
        )}

        <label className="te-field">
          הערה
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {messages.length > 0 && (
          <ul className="te-errors" role="alert">
            {messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

        <div className="te-actions">
          <Button onClick={() => void save()} disabled={!result.valid}>
            שמור
          </Button>
          {existing && (
            <Button variant="danger" onClick={() => void remove()}>
              מחק
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" onClick={onClose}>
              ביטול
            </Button>
          )}
        </div>
          </>
        )}
      </div>
    </Card>
  );
}

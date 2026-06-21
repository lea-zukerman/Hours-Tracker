import { useState } from 'react';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { formatDate } from '../../ui/format.ts';
import type { Absence, AbsenceType, IsoDate } from '../../domain/types.ts';
import { useAbsences } from '../../app/hooks/useAbsences.ts';
import { LOCAL_USER_ID } from '../../data/LocalStorageRepository.ts';

const TYPE_LABELS: Record<AbsenceType, string> = {
  vacation: 'חופשה',
  sick: 'מחלה',
  holiday: 'חג',
  reserve: 'מילואים',
  unpaid: 'חל״ת',
};

/**
 * Report an absence (DESIGN.md §8; SPEC §3.6, UC-3/UC-4). Creates an absence
 * over a date range — full day, or partial (a fraction of the daily target,
 * for UC-4 half-day sick). Lists the month's absences with delete (edit = delete
 * + re-create for MVP). Future-dated absences are allowed (SPEC §6.3.16).
 */
export function ReportAbsenceForm({
  date,
  month,
  onClose,
}: {
  date: IsoDate;
  month: string;
  onClose?: () => void;
}) {
  const { absences, upsertAbsence, deleteAbsence } = useAbsences(month);

  const [type, setType] = useState<AbsenceType>('vacation');
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [isPartial, setIsPartial] = useState(false);
  const [partialHours, setPartialHours] = useState('4');
  const [note, setNote] = useState('');

  const errors: string[] = [];
  if (to < from) errors.push('תאריך הסיום מוקדם מתאריך ההתחלה');
  let partialMinutes: number | undefined;
  if (isPartial) {
    const hours = parseFloat(partialHours);
    partialMinutes = Number.isFinite(hours) ? Math.round(hours * 60) : NaN;
    if (!Number.isFinite(partialMinutes) || partialMinutes <= 0) {
      errors.push('יש להזין מספר שעות חלקי תקין');
    }
  }
  const valid = errors.length === 0;

  async function save() {
    if (!valid) return;
    const absence: Absence = {
      id: crypto.randomUUID(),
      userId: LOCAL_USER_ID,
      dateFrom: from,
      dateTo: to,
      type,
      partialMinutes: isPartial ? partialMinutes : undefined,
      note: note.trim() ? note.trim() : undefined,
    };
    await upsertAbsence(absence);
    onClose?.();
  }

  return (
    <Card title="דיווח היעדרות">
      <div className="te-form">
        <label className="te-field">
          סוג
          <select value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
            {(Object.keys(TYPE_LABELS) as AbsenceType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <div className="te-row">
          <label className="te-field">
            מתאריך
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="te-field">
            עד תאריך
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <label className="te-checkbox">
          <input
            type="checkbox"
            checked={isPartial}
            onChange={(e) => setIsPartial(e.target.checked)}
          />
          יום חלקי
        </label>
        {isPartial && (
          <label className="te-field">
            שעות חלקיות
            <input
              type="number"
              min="0"
              step="0.25"
              value={partialHours}
              onChange={(e) => setPartialHours(e.target.value)}
            />
          </label>
        )}

        <label className="te-field">
          הערה
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {errors.length > 0 && (
          <ul className="te-errors" role="alert">
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

        <div className="te-actions">
          <Button onClick={() => void save()} disabled={!valid}>
            שמור
          </Button>
          {onClose && (
            <Button variant="ghost" onClick={onClose}>
              ביטול
            </Button>
          )}
        </div>

        {absences.length > 0 && (
          <ul className="ab-list">
            {absences.map((a) => (
              <li key={a.id} className="ab-list__item">
                <span>
                  {TYPE_LABELS[a.type]} · {formatDate(a.dateFrom)}
                  {a.dateTo !== a.dateFrom ? `–${formatDate(a.dateTo)}` : ''}
                  {a.partialMinutes !== undefined ? ' (חלקי)' : ''}
                </span>
                <Button
                  variant="ghost"
                  aria-label="מחק היעדרות"
                  onClick={() => void deleteAbsence(a.id)}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

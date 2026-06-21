import { useEffect, useState } from 'react';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import type { AlertType, Settings, Weekday } from '../../domain/types.ts';
import { useSettings } from '../../app/hooks/useSettings.ts';

const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']; // index 0=Sun … 6=Sat
const ALERT_LABELS: Record<AlertType, string> = {
  end_of_month: 'התראת סוף חודש',
  overtime: 'שעות נוספות',
  logging_reminder: 'תזכורת דיווח',
  suspicious_outlier: 'דיווח חריג',
  cannot_complete: 'לא ניתן להשלים',
  absence_balance_low: 'יתרת היעדרות נמוכה',
};

/**
 * Settings screen (DESIGN.md §8; SPEC §3.3). Edits the user's Settings: quota /
 * job %, daily target, work days, break policy, hours format, accruals, and
 * per-type alert toggles + lead days. Saves via useSettings; changes flow into
 * every calculation immediately (the settings query is invalidated).
 */
export function SettingsPage() {
  const { settings, saveSettings, isSaving } = useSettings();
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Initialise the form once, when settings first load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  if (!form) return <Card title="הגדרות">…</Card>;

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
  }
  const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
  const toMinutes = (h: string) => Math.round((Number(h) || 0) * 60);

  const toggleDay = (d: Weekday) =>
    set(
      'workDays',
      form.workDays.includes(d)
        ? form.workDays.filter((x) => x !== d)
        : ([...form.workDays, d].sort() as Weekday[]),
    );
  const toggleAlert = (t: AlertType) =>
    set('alertsEnabled', { ...form.alertsEnabled, [t]: !form.alertsEnabled[t] });

  async function save() {
    if (!form) return;
    await saveSettings(form);
    setSaved(true);
  }

  return (
    <Card title="הגדרות">
      <div className="te-form">
        <label className="te-field">
          מכסה חודשית (שעות)
          <input
            type="number"
            min="0"
            value={hours(form.monthlyQuotaMinutes)}
            onChange={(e) => set('monthlyQuotaMinutes', toMinutes(e.target.value))}
          />
        </label>

        <label className="te-field">
          יעד יומי (שעות)
          <input
            type="number"
            min="0"
            step="0.25"
            value={hours(form.dailyTargetMinutes)}
            onChange={(e) => set('dailyTargetMinutes', toMinutes(e.target.value))}
          />
        </label>

        <label className="te-field">
          אחוז משרה
          <input
            type="number"
            min="1"
            max="100"
            value={form.jobPercent}
            onChange={(e) => set('jobPercent', Number(e.target.value))}
          />
        </label>

        <fieldset className="te-field">
          <legend>ימי עבודה</legend>
          <div className="te-modes">
            {DAY_LABELS.map((label, i) => (
              <label key={i} className="te-checkbox">
                <input
                  type="checkbox"
                  checked={form.workDays.includes(i as Weekday)}
                  onChange={() => toggleDay(i as Weekday)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="te-field">
          תצוגת שעות
          <select
            value={form.hoursFormat}
            onChange={(e) => set('hoursFormat', e.target.value as Settings['hoursFormat'])}
          >
            <option value="hm">שעות:דקות</option>
            <option value="decimal">עשרוני</option>
          </select>
        </label>

        <label className="te-checkbox">
          <input
            type="checkbox"
            checked={form.autoBreakEnabled}
            onChange={(e) => set('autoBreakEnabled', e.target.checked)}
          />
          ניכוי הפסקה אוטומטי
        </label>
        {form.autoBreakEnabled && (
          <div className="te-row">
            <label className="te-field">
              סף נוכחות (דקות)
              <input
                type="number"
                min="0"
                value={form.autoBreakThresholdMinutes}
                onChange={(e) => set('autoBreakThresholdMinutes', Number(e.target.value))}
              />
            </label>
            <label className="te-field">
              ניכוי (דקות)
              <input
                type="number"
                min="0"
                value={form.autoBreakDeductMinutes}
                onChange={(e) => set('autoBreakDeductMinutes', Number(e.target.value))}
              />
            </label>
          </div>
        )}

        <label className="te-field">
          התראת סוף חודש — ימים לפני
          <input
            type="number"
            min="0"
            value={form.alertLeadDays}
            onChange={(e) => set('alertLeadDays', Number(e.target.value))}
          />
        </label>

        <fieldset className="te-field">
          <legend>צבירת היעדרויות (ימים)</legend>
          <div className="te-row">
            <label className="te-field">
              חופשה לחודש
              <input
                type="number"
                min="0"
                step="0.25"
                value={form.vacationAccrualPerMonth}
                onChange={(e) => set('vacationAccrualPerMonth', Number(e.target.value))}
              />
            </label>
            <label className="te-field">
              מחלה לחודש
              <input
                type="number"
                min="0"
                step="0.25"
                value={form.sickAccrualPerMonth}
                onChange={(e) => set('sickAccrualPerMonth', Number(e.target.value))}
              />
            </label>
          </div>
          <div className="te-row">
            <label className="te-field">
              יתרת חופשה פותחת
              <input
                type="number"
                step="0.25"
                value={form.vacationOpeningBalance}
                onChange={(e) => set('vacationOpeningBalance', Number(e.target.value))}
              />
            </label>
            <label className="te-field">
              יתרת מחלה פותחת
              <input
                type="number"
                step="0.25"
                value={form.sickOpeningBalance}
                onChange={(e) => set('sickOpeningBalance', Number(e.target.value))}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="te-field">
          <legend>התראות פעילות</legend>
          {(Object.keys(ALERT_LABELS) as AlertType[]).map((t) => (
            <label key={t} className="te-checkbox">
              <input
                type="checkbox"
                checked={form.alertsEnabled[t]}
                onChange={() => toggleAlert(t)}
              />
              {ALERT_LABELS[t]}
            </label>
          ))}
        </fieldset>

        <div className="te-actions">
          <Button onClick={() => void save()} disabled={isSaving}>
            שמור הגדרות
          </Button>
          {saved && <span className="settings__saved">נשמר ✓</span>}
        </div>
      </div>
    </Card>
  );
}

import type { ActiveAlert } from '../../domain/alerts.ts';
import type { AlertType } from '../../domain/types.ts';
import { formatMinutes, formatDate } from '../../ui/format.ts';

/** Visual tone per alert type — the most urgent read as danger. */
export function alertTone(type: AlertType): 'danger' | 'warn' {
  return type === 'cannot_complete' || type === 'end_of_month' ? 'danger' : 'warn';
}

/**
 * Hebrew text for an active alert (SPEC §3.4). The domain returns type + raw
 * params (DESIGN.md §6 alerts.ts); this is the UI's mapping to a sentence —
 * minutes via formatMinutes, dates via formatDate.
 */
export function alertText(alert: ActiveAlert): string {
  const p = alert.params;
  switch (alert.type) {
    case 'end_of_month':
      return `נותרו ${formatMinutes(Number(p.minutesToComplete))} להשלמה ב-${p.days} ימי עבודה (≈${formatMinutes(Number(p.perDayMinutes))} ליום)`;
    case 'overtime':
      return p.scope === 'month'
        ? `החודש חרגת מהמכסה ב-${formatMinutes(Number(p.overMinutes))}`
        : `חריגה מהיעד ב-${formatDate(String(p.date))}: ${formatMinutes(Number(p.overMinutes))} מעבר ליעד`;
    case 'logging_reminder':
      return `${p.count} ימי עבודה ללא דיווח (אחרון: ${formatDate(String(p.latest))})`;
    case 'suspicious_outlier':
      return `דיווח חריג ב-${formatDate(String(p.date))} (${formatMinutes(Number(p.minutes))}) — כדאי לוודא שאין טעות`;
    case 'cannot_complete':
      return `החודש ייסגר בגירעון של ${formatMinutes(Number(p.deficitMinutes))}`;
    case 'absence_balance_low':
      return `יתרת ${p.kind === 'vacation' ? 'חופשה' : 'מחלה'} נמוכה: ${p.balanceDays} ימים`;
  }
}

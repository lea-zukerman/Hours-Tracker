import type {
  Absence,
  AlertType,
  IsoDate,
  MonthSummary,
  Settings,
  TimeEntry,
} from './types.ts';
import { entryWorkedMinutes } from './time.ts';
import { missingWorkdays } from './calculations.ts';

/**
 * One active alert. `params` carries the raw numbers/labels; the UI (8.3) maps
 * `type` + `params` to a Hebrew message — no user-facing text lives here.
 */
export interface ActiveAlert {
  type: AlertType;
  params: Record<string, number | string>;
}

/**
 * Everything `deriveAlerts` needs, in one object.
 *
 * NOTE — deliberate signature deviation from DESIGN §6 / TASKS T4, which list
 * `deriveAlerts(summary, settings, entries, today)`. Three alerts need more
 * than that, so the context is widened (same pattern as calculations.ts):
 * - `zone` + `entries` → per-day worked minutes (overtime, suspicious_outlier);
 * - `absences` → the missing-day reminder;
 * - `vacationBalanceDays` / `sickBalanceDays` → accrued balances are
 *   history-dependent (they need months-elapsed and all-time usage), which a
 *   single month's data can't express. The caller (a hook, with full history)
 *   computes them via absenceBalance (1.13) and passes them in, keeping this
 *   function pure and testable.
 */
export interface AlertContext {
  summary: MonthSummary;
  settings: Settings;
  entries: TimeEntry[];
  absences: Absence[];
  today: IsoDate;
  zone: string;
  vacationBalanceDays: number;
  sickBalanceDays: number;
}

/** A single day longer than this reads as a likely mistake (SPEC §3.4). */
const OUTLIER_MINUTES = 12 * 60;
/** Below this many accrued days, warn that the balance is running out. */
const LOW_BALANCE_DAYS = 1;

/**
 * Derive the active alerts for a month (DESIGN.md §6 alerts.ts; SPEC §3.4).
 *
 * Pure: same context → same alerts, no side effects. Each alert type is gated
 * by its `settings.alertsEnabled[type]` toggle, so a disabled type never fires
 * even when its condition holds. Returned in rough priority order
 * (most urgent first) for the banner to render top-down.
 */
export function deriveAlerts(ctx: AlertContext): ActiveAlert[] {
  const { summary, settings, entries, absences, today, zone } = ctx;
  const on = settings.alertsEnabled;
  const alerts: ActiveAlert[] = [];

  // Per-entry worked minutes, computed once and reused (overtime + outlier).
  const worked = entries.map((entry) => ({
    entry,
    minutes: entryWorkedMinutes(entry, settings, zone),
  }));

  // cannot_complete — a deficit that no remaining work day can close.
  if (on.cannot_complete && summary.status === 'cannot_complete') {
    alerts.push({
      type: 'cannot_complete',
      params: { deficitMinutes: summary.hoursToCompleteMinutes },
    });
  }

  // end_of_month — within the lead window, still in deficit, with days left.
  // (No days left + deficit is cannot_complete above, not this.)
  if (
    on.end_of_month &&
    summary.balanceMinutes < 0 &&
    summary.remainingWorkdays > 0 &&
    summary.remainingWorkdays <= settings.alertLeadDays
  ) {
    alerts.push({
      type: 'end_of_month',
      params: {
        minutesToComplete: summary.hoursToCompleteMinutes,
        days: summary.remainingWorkdays,
        perDayMinutes: summary.requiredPerDayMinutes ?? 0,
      },
    });
  }

  // absence_balance_low — vacation and/or sick balance running out or negative.
  if (on.absence_balance_low) {
    if (ctx.vacationBalanceDays < LOW_BALANCE_DAYS) {
      alerts.push({
        type: 'absence_balance_low',
        params: { kind: 'vacation', balanceDays: ctx.vacationBalanceDays },
      });
    }
    if (ctx.sickBalanceDays < LOW_BALANCE_DAYS) {
      alerts.push({
        type: 'absence_balance_low',
        params: { kind: 'sick', balanceDays: ctx.sickBalanceDays },
      });
    }
  }

  // overtime — per day over the daily target, and/or the month over quota.
  if (on.overtime) {
    for (const { entry, minutes } of worked) {
      if (minutes > settings.dailyTargetMinutes) {
        alerts.push({
          type: 'overtime',
          params: { scope: 'day', date: entry.date, overMinutes: minutes - settings.dailyTargetMinutes },
        });
      }
    }
    if (summary.balanceMinutes > 0) {
      alerts.push({
        type: 'overtime',
        params: { scope: 'month', overMinutes: summary.balanceMinutes },
      });
    }
  }

  // suspicious_outlier — a single day longer than 12h.
  if (on.suspicious_outlier) {
    for (const { entry, minutes } of worked) {
      if (minutes > OUTLIER_MINUTES) {
        alerts.push({
          type: 'suspicious_outlier',
          params: { date: entry.date, minutes },
        });
      }
    }
  }

  // logging_reminder — past work days with no entry and no absence.
  if (on.logging_reminder) {
    const missing = missingWorkdays(today, summary.month, settings, entries, absences);
    if (missing.length > 0) {
      alerts.push({
        type: 'logging_reminder',
        params: { count: missing.length, latest: missing[missing.length - 1] },
      });
    }
  }

  return alerts;
}

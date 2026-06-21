import { describe, it, expect } from 'vitest';
import { deriveAlerts, type AlertContext } from '../alerts.ts';
import { makeSettings, makeEntry } from './fixtures.ts';
import type { MonthSummary } from '../types.ts';

/** A neutral MonthSummary (on_track, nothing due); override per test. */
function makeSummary(overrides: Partial<MonthSummary> = {}): MonthSummary {
  return {
    userId: 'u1',
    month: '2026-06',
    workedMinutes: 0,
    creditedMinutes: 0,
    quotaMinutes: 10920,
    balanceMinutes: 0,
    remainingWorkdays: 10,
    hoursToCompleteMinutes: 0,
    requiredPerDayMinutes: 0,
    status: 'on_track',
    ...overrides,
  };
}

/**
 * A context that fires NO alerts by default: today is the month's first day
 * (so there are no past work days → no logging reminder), balances are healthy,
 * no entries, neutral summary.
 */
function makeCtx(overrides: Partial<AlertContext> = {}): AlertContext {
  return {
    summary: makeSummary(),
    settings: makeSettings(),
    entries: [],
    absences: [],
    today: '2026-06-01',
    zone: 'Asia/Jerusalem',
    vacationBalanceDays: 10,
    sickBalanceDays: 10,
    ...overrides,
  };
}

const typesOf = (ctx: AlertContext) => deriveAlerts(ctx).map((a) => a.type);

describe('deriveAlerts', () => {
  it('fires nothing for a neutral context', () => {
    expect(deriveAlerts(makeCtx())).toEqual([]);
  });

  it('end_of_month: deficit within the lead window with days left', () => {
    const ctx = makeCtx({
      summary: makeSummary({
        balanceMinutes: -1000,
        remainingWorkdays: 3, // ≤ alertLeadDays (5)
        hoursToCompleteMinutes: 1000,
        requiredPerDayMinutes: 334,
        status: 'deficit',
      }),
    });
    const alert = deriveAlerts(ctx).find((a) => a.type === 'end_of_month');
    expect(alert).toBeDefined();
    expect(alert!.params).toMatchObject({ days: 3, minutesToComplete: 1000, perDayMinutes: 334 });
  });

  it('cannot_complete: a deficit with no remaining days', () => {
    const ctx = makeCtx({
      summary: makeSummary({
        balanceMinutes: -1000,
        remainingWorkdays: 0,
        hoursToCompleteMinutes: 1000,
        requiredPerDayMinutes: null,
        status: 'cannot_complete',
      }),
    });
    expect(typesOf(ctx)).toContain('cannot_complete');
    // ...and NOT end_of_month (no days left routes to cannot_complete only)
    expect(typesOf(ctx)).not.toContain('end_of_month');
  });

  it('overtime: a day over the daily target', () => {
    const ctx = makeCtx({
      entries: [makeEntry({ date: '2026-06-01', manualMinutes: 600 })], // > 516 target
    });
    const alert = deriveAlerts(ctx).find((a) => a.type === 'overtime');
    expect(alert).toBeDefined();
    expect(alert!.params).toMatchObject({ scope: 'day', date: '2026-06-01', overMinutes: 84 });
  });

  it('overtime: the month over quota (surplus)', () => {
    const ctx = makeCtx({ summary: makeSummary({ balanceMinutes: 120, status: 'surplus' }) });
    const alert = deriveAlerts(ctx).find(
      (a) => a.type === 'overtime' && a.params.scope === 'month',
    );
    expect(alert).toBeDefined();
    expect(alert!.params.overMinutes).toBe(120);
  });

  it('suspicious_outlier: a day longer than 12h', () => {
    const ctx = makeCtx({
      entries: [makeEntry({ date: '2026-06-01', manualMinutes: 13 * 60 })], // 780 > 720
    });
    const alert = deriveAlerts(ctx).find((a) => a.type === 'suspicious_outlier');
    expect(alert).toBeDefined();
    expect(alert!.params).toMatchObject({ date: '2026-06-01', minutes: 780 });
  });

  it('logging_reminder: a past work day with no entry/absence', () => {
    const ctx = makeCtx({ today: '2026-06-23' }); // many past June work days, none logged
    const alert = deriveAlerts(ctx).find((a) => a.type === 'logging_reminder');
    expect(alert).toBeDefined();
    expect(alert!.params.count).toBeGreaterThan(0);
  });

  it('absence_balance_low: vacation balance below the threshold', () => {
    const ctx = makeCtx({ vacationBalanceDays: -2, sickBalanceDays: 10 });
    const matches = deriveAlerts(ctx).filter((a) => a.type === 'absence_balance_low');
    expect(matches).toHaveLength(1);
    expect(matches[0].params).toMatchObject({ kind: 'vacation', balanceDays: -2 });
  });

  it('respects alertsEnabled: every type off → no alerts even when conditions hold', () => {
    const ctx = makeCtx({
      settings: makeSettings({
        alertsEnabled: {
          end_of_month: false,
          overtime: false,
          logging_reminder: false,
          suspicious_outlier: false,
          cannot_complete: false,
          absence_balance_low: false,
        },
      }),
      summary: makeSummary({
        balanceMinutes: -1000,
        remainingWorkdays: 0,
        hoursToCompleteMinutes: 1000,
        requiredPerDayMinutes: null,
        status: 'cannot_complete',
      }),
      today: '2026-06-23',
      entries: [makeEntry({ date: '2026-06-01', manualMinutes: 13 * 60 })],
      vacationBalanceDays: -5,
      sickBalanceDays: -5,
    });
    expect(deriveAlerts(ctx)).toEqual([]);
  });
});

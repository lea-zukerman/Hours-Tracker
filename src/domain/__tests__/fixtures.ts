import type { Settings, Shift, TimeEntry } from '../types.ts';

/**
 * Default Settings for tests — mirrors the product defaults (DESIGN.md §4:
 * 182h/month, 8:36/day, Sun–Thu). Override any field per test via the param.
 */
export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    userId: 'u1',
    monthlyQuotaMinutes: 182 * 60, // 10920
    dailyTargetMinutes: 8 * 60 + 36, // 516
    jobPercent: 100,
    workDays: [0, 1, 2, 3, 4], // Sun–Thu
    autoBreakEnabled: false,
    autoBreakThresholdMinutes: 6 * 60, // 360
    autoBreakDeductMinutes: 30,
    hoursFormat: 'hm',
    alertLeadDays: 5,
    alertsEnabled: {
      end_of_month: true,
      overtime: true,
      logging_reminder: true,
      suspicious_outlier: true,
      cannot_complete: true,
      absence_balance_low: true,
    },
    vacationAccrualPerMonth: 1.5,
    sickAccrualPerMonth: 1.5,
    vacationOpeningBalance: 0,
    sickOpeningBalance: 0,
    ...overrides,
  };
}

/** Convenience: a Shift literal. */
export function makeShift(start: string, end: string | null): Shift {
  return { start, end };
}

/** A TimeEntry with sensible defaults; override any field per test. */
export function makeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'e1',
    userId: 'u1',
    date: '2026-06-18',
    shifts: [],
    breakMinutes: 0,
    ...overrides,
  };
}

/**
 * Core data model — the canonical types for the whole project.
 * Source of truth: DESIGN.md §4. Types only, no logic (Milestone 1.1).
 *
 * Conventions:
 * - All durations are **integer minutes** (DESIGN.md §1.3).
 * - A calendar day is an ISO 'YYYY-MM-DD' string (zone-independent).
 * - An instant is an ISO 8601 UTC string.
 */

// ----- Identifiers -----
export type ID = string; // uuid
export type IsoDate = string; // 'YYYY-MM-DD'  (a calendar day, zone-independent)
export type IsoInstant = string; // ISO 8601 with offset, e.g. '2026-06-18T07:00:00.000Z'
export type Minutes = number; // integer

/** 0 = Sunday … 6 = Saturday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ----- User & Settings -----
export interface User {
  id: ID;
  name: string;
  email: string;
  locale: string; // 'he-IL'
  timezone: string; // IANA, e.g. 'Asia/Jerusalem'
}

export interface Settings {
  userId: ID;
  monthlyQuotaMinutes: Minutes; // default 182*60 = 10920
  dailyTargetMinutes: Minutes; // default 8h36 = 516
  jobPercent: number; // 1..100; scales quota & target
  workDays: Weekday[]; // default [Sun..Thu]
  autoBreakEnabled: boolean; // default false
  autoBreakThresholdMinutes: Minutes; // presence over which a break is deducted
  autoBreakDeductMinutes: Minutes; // amount deducted
  hoursFormat: 'hm' | 'decimal';
  alertLeadDays: number; // default 5 (end-of-month alert)
  alertsEnabled: Record<AlertType, boolean>;
  vacationAccrualPerMonth: number; // days
  sickAccrualPerMonth: number; // days
  vacationOpeningBalance: number; // days
  sickOpeningBalance: number; // days
}

// ----- Time entries -----
export interface Shift {
  start: IsoInstant;
  end: IsoInstant | null; // null while a live clock is running
}

export interface TimeEntry {
  id: ID;
  userId: ID;
  date: IsoDate; // the day this entry belongs to (start's local day)
  shifts: Shift[]; // supports multiple shifts/day (§3.2B)
  breakMinutes: Minutes; // manual + auto-deducted breaks
  manualMinutes?: Minutes; // total-hours-only entry (no exact times) (§3.2B)
  note?: string;
}

// ----- Absences -----
export type AbsenceType = 'vacation' | 'sick' | 'holiday' | 'reserve' | 'unpaid';

export interface Absence {
  id: ID;
  userId: ID;
  dateFrom: IsoDate;
  dateTo: IsoDate;
  type: AbsenceType;
  partialMinutes?: Minutes; // set => partial day; absent => full day (§3.6, §6.2.10)
  note?: string;
}

// ----- Computed (never stored) -----
export type MonthStatus = 'surplus' | 'deficit' | 'on_track' | 'cannot_complete';

export interface MonthInput {
  month: string; // 'YYYY-MM'
  today: IsoDate; // for remaining/missing day math
  zone: string; // IANA, for shift duration
  settings: Settings;
  entries: TimeEntry[];
  absences: Absence[];
}

export interface MonthSummary {
  userId: ID;
  month: string; // 'YYYY-MM'
  workedMinutes: Minutes;
  creditedMinutes: Minutes; // worked + paid absences
  quotaMinutes: Minutes;
  balanceMinutes: Minutes; // credited - quota (negative = deficit)
  remainingWorkdays: number;
  hoursToCompleteMinutes: Minutes;
  requiredPerDayMinutes: Minutes | null; // null when no workdays remain
  status: MonthStatus;
}

// ----- Validation (domain codes; UI maps them to Hebrew messages, 5.3) -----
export type ValidationCode =
  | 'out_before_in'
  | 'break_exceeds_presence'
  | 'clock_out_without_in'
  | 'invalid_input'
  | 'overlapping_shifts'
  | 'future_worked_hours';

export interface ValidationIssue {
  code: ValidationCode;
  shiftIndex?: number; // which shift triggered it, when applicable
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export type AlertType =
  | 'end_of_month'
  | 'overtime'
  | 'logging_reminder'
  | 'suspicious_outlier'
  | 'cannot_complete'
  | 'absence_balance_low';

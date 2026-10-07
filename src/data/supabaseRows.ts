import type { Absence, AbsenceType, Settings, Shift, TimeEntry, Weekday } from '../domain/types.ts';
import type { Database, Json } from './database.types.ts';

/**
 * Domain (camelCase) ↔ Postgres row (snake_case) mappers for SupabaseRepository.
 * Writers always stamp the session user (incoming userId is ignored) and never
 * send updated_at (a database trigger owns it).
 */
type Tables = Database['public']['Tables'];
export type EntryRow = Tables['time_entries']['Row'];
export type AbsenceRow = Tables['absences']['Row'];
export type SettingsRow = Tables['settings']['Row'];
type EntryInsert = Tables['time_entries']['Insert'];
type AbsenceInsert = Tables['absences']['Insert'];
type SettingsInsert = Tables['settings']['Insert'];

export function toEntryRow(entry: TimeEntry, userId: string): EntryInsert {
  return {
    id: entry.id,
    user_id: userId,
    date: entry.date,
    shifts: entry.shifts as unknown as Json,
    break_minutes: entry.breakMinutes,
    manual_minutes: entry.manualMinutes ?? null,
    note: entry.note ?? null,
  };
}

export function fromEntryRow(row: EntryRow): TimeEntry {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    shifts: row.shifts as unknown as Shift[],
    breakMinutes: row.break_minutes,
    manualMinutes: row.manual_minutes ?? undefined,
    note: row.note ?? undefined,
  };
}

export function toAbsenceRow(absence: Absence, userId: string): AbsenceInsert {
  return {
    id: absence.id,
    user_id: userId,
    date_from: absence.dateFrom,
    date_to: absence.dateTo,
    type: absence.type,
    partial_minutes: absence.partialMinutes ?? null,
    note: absence.note ?? null,
  };
}

export function fromAbsenceRow(row: AbsenceRow): Absence {
  return {
    id: row.id,
    userId: row.user_id,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    type: row.type as AbsenceType,
    partialMinutes: row.partial_minutes ?? undefined,
    note: row.note ?? undefined,
  };
}

export function toSettingsRow(s: Settings, userId: string): SettingsInsert {
  return {
    user_id: userId,
    monthly_quota_minutes: s.monthlyQuotaMinutes,
    daily_target_minutes: s.dailyTargetMinutes,
    job_percent: s.jobPercent,
    work_days: s.workDays,
    auto_break_enabled: s.autoBreakEnabled,
    auto_break_threshold_minutes: s.autoBreakThresholdMinutes,
    auto_break_deduct_minutes: s.autoBreakDeductMinutes,
    hours_format: s.hoursFormat,
    alert_lead_days: s.alertLeadDays,
    alerts_enabled: s.alertsEnabled as unknown as Json,
    vacation_accrual_per_month: s.vacationAccrualPerMonth,
    sick_accrual_per_month: s.sickAccrualPerMonth,
    vacation_opening_balance: s.vacationOpeningBalance,
    sick_opening_balance: s.sickOpeningBalance,
  };
}

export function fromSettingsRow(row: SettingsRow): Settings {
  return {
    userId: row.user_id,
    monthlyQuotaMinutes: row.monthly_quota_minutes,
    dailyTargetMinutes: row.daily_target_minutes,
    jobPercent: row.job_percent,
    workDays: row.work_days as Weekday[],
    autoBreakEnabled: row.auto_break_enabled,
    autoBreakThresholdMinutes: row.auto_break_threshold_minutes,
    autoBreakDeductMinutes: row.auto_break_deduct_minutes,
    hoursFormat: row.hours_format as Settings['hoursFormat'],
    alertLeadDays: row.alert_lead_days,
    alertsEnabled: row.alerts_enabled as unknown as Settings['alertsEnabled'],
    vacationAccrualPerMonth: row.vacation_accrual_per_month,
    sickAccrualPerMonth: row.sick_accrual_per_month,
    vacationOpeningBalance: row.vacation_opening_balance,
    sickOpeningBalance: row.sick_opening_balance,
  };
}

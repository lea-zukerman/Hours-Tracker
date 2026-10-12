import { DateTime } from 'luxon';
import type {
  Absence,
  AbsenceType,
  MonthSummary,
  Settings,
  TimeEntry,
} from '../../domain/types.ts';
import { entryWorkedMinutes } from '../../domain/time.ts';
import { supabase } from '../../data/supabaseClient.ts';

/** What the browser sends to /api/analyze-month: numbers only, nothing identifying. */
export interface InsightInput {
  month: string;
  workedMinutes: number;
  creditedMinutes: number;
  quotaMinutes: number;
  balanceMinutes: number;
  remainingWorkdays: number;
  requiredPerDayMinutes: number | null;
  status: MonthSummary['status'];
  daysWorked: number;
  longDays: number;
  dailyTargetMinutes: number;
  absenceDays: Record<AbsenceType, number>;
}

export type InsightResult =
  | { ok: true; text: string }
  | { ok: false; error: 'rate_limited' | 'unavailable' | 'network' | 'unauthorized' };

/** Days of each absence type that fall inside `month` (a partial day counts as a day). */
function absenceDaysIn(month: string, absences: Absence[]): Record<AbsenceType, number> {
  const days: Record<AbsenceType, number> = {
    vacation: 0,
    sick: 0,
    holiday: 0,
    reserve: 0,
    unpaid: 0,
  };
  const start = DateTime.fromISO(`${month}-01`);
  const end = start.endOf('month');
  for (const a of absences) {
    const from = DateTime.max(DateTime.fromISO(a.dateFrom), start);
    const to = DateTime.min(DateTime.fromISO(a.dateTo), end);
    if (to >= from) days[a.type] += Math.floor(to.diff(from, 'days').days) + 1;
  }
  return days;
}

export function buildInsightInput(
  summary: MonthSummary,
  entries: TimeEntry[],
  absences: Absence[],
  settings: Settings,
  zone: string,
): InsightInput {
  const worked = entries.map((e) => entryWorkedMinutes(e, settings, zone)).filter((m) => m > 0);
  return {
    month: summary.month,
    workedMinutes: Math.round(summary.workedMinutes),
    creditedMinutes: Math.round(summary.creditedMinutes),
    quotaMinutes: Math.round(summary.quotaMinutes),
    balanceMinutes: Math.round(summary.balanceMinutes),
    remainingWorkdays: summary.remainingWorkdays,
    requiredPerDayMinutes:
      summary.requiredPerDayMinutes === null ? null : Math.round(summary.requiredPerDayMinutes),
    status: summary.status,
    daysWorked: worked.length,
    longDays: worked.filter((m) => m > settings.dailyTargetMinutes).length,
    dailyTargetMinutes: settings.dailyTargetMinutes,
    absenceDays: absenceDaysIn(summary.month, absences),
  };
}

/** Calls the server with the signed-in user's token. The Gemini key never reaches the browser. */
export async function requestInsight(input: InsightInput): Promise<InsightResult> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'unauthorized' };
  let res: Response;
  try {
    res = await fetch('/api/analyze-month', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: 'network' };
  }
  if (res.ok) {
    const body = (await res.json()) as { text?: unknown };
    return typeof body.text === 'string'
      ? { ok: true, text: body.text }
      : { ok: false, error: 'unavailable' };
  }
  if (res.status === 429) return { ok: false, error: 'rate_limited' };
  if (res.status === 401) return { ok: false, error: 'unauthorized' };
  return { ok: false, error: 'unavailable' };
}

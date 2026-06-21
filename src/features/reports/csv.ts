import type { MonthSummary } from '../../domain/types.ts';
import { formatDate, formatMinutes } from '../../ui/format.ts';
import type { ReportRow } from './monthRows.ts';

const HEADER = ['תאריך', 'כניסה', 'יציאה', 'הפסקה (דק׳)', 'נטו', 'היעדרות', 'הערה'];

/** Quote a CSV field when it contains a comma, quote, or newline (RFC 4180). */
function escape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Render a month's rows + summary as a CSV string (DESIGN.md §8; SPEC §3.5).
 * Prefixed with a UTF-8 BOM so Excel opens the Hebrew correctly. The summary
 * (worked / credited / quota / balance) is appended after a blank line.
 */
export function toCsv(rows: ReportRow[], summary: MonthSummary): string {
  const lines: string[] = [];
  lines.push(HEADER.map(escape).join(','));

  for (const r of rows) {
    lines.push(
      [
        formatDate(r.date),
        r.inTime,
        r.outTime,
        r.breakMinutes,
        formatMinutes(r.netMinutes),
        r.absence,
        r.note,
      ]
        .map(escape)
        .join(','),
    );
  }

  lines.push('');
  lines.push([escape('עבדת'), escape(formatMinutes(summary.workedMinutes))].join(','));
  lines.push([escape('מזוכה'), escape(formatMinutes(summary.creditedMinutes))].join(','));
  lines.push([escape('מכסה'), escape(formatMinutes(summary.quotaMinutes))].join(','));
  lines.push([escape('מאזן'), escape(formatMinutes(summary.balanceMinutes))].join(','));

  return '﻿' + lines.join('\r\n');
}

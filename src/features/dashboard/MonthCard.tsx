import { Card } from '../../ui/Card.tsx';
import { ProgressBar } from '../../ui/ProgressBar.tsx';
import { BalanceBadge } from '../../ui/BalanceBadge.tsx';
import { formatMinutes } from '../../ui/format.ts';
import { useMonthSummary } from '../../app/hooks/useMonthSummary.ts';
import type { MonthStatus } from '../../domain/types.ts';

const DEFAULT_ZONE = 'Asia/Jerusalem';

const STATUS_TEXT: Record<MonthStatus, string> = {
  surplus: 'עודף',
  deficit: 'גירעון',
  on_track: 'במסלול',
  cannot_complete: 'לא ניתן להשלים',
};

/**
 * This month at a glance (DESIGN.md §8): worked/quota, progress %, balance,
 * forecast (required-per-day) and remaining work days. Reproduces the UC-2
 * display. History navigation is 7.2 (out of scope here).
 */
export function MonthCard({
  month,
  today,
  zone = DEFAULT_ZONE,
}: {
  month: string;
  today?: string;
  zone?: string;
}) {
  const { summary } = useMonthSummary(month, { today, zone });
  if (!summary) return <Card title="החודש">…</Card>;

  const ratio = summary.quotaMinutes > 0 ? summary.creditedMinutes / summary.quotaMinutes : 0;
  const barColor = ratio >= 1 ? 'var(--positive)' : 'var(--accent)';

  const forecast =
    summary.requiredPerDayMinutes === null
      ? 'לא ניתן להשלים החודש'
      : summary.requiredPerDayMinutes === 0
        ? 'עמדת ביעד החודש'
        : `נדרש ${formatMinutes(summary.requiredPerDayMinutes)} בכל יום עבודה שנותר`;

  return (
    <Card title="החודש">
      <div className="month">
        <div className="month__headline">
          <span className="num month__worked">{formatMinutes(summary.workedMinutes)}</span>
          <span className="month__quota num"> / {formatMinutes(summary.quotaMinutes)}</span>
        </div>

        <ProgressBar value={ratio} color={barColor} label="התקדמות החודש" />

        <div className="month__stats">
          <div className="month__stat">
            <span className="label">מאזן</span>
            <BalanceBadge minutes={summary.balanceMinutes} />
          </div>
          <div className="month__stat">
            <span className="label">ימי עבודה שנותרו</span>
            <span className="num month__stat-value">{summary.remainingWorkdays}</span>
          </div>
          <div className="month__stat">
            <span className="label">סטטוס</span>
            <span className="month__stat-value">{STATUS_TEXT[summary.status]}</span>
          </div>
        </div>

        <p className="month__forecast">{forecast}</p>
      </div>
    </Card>
  );
}

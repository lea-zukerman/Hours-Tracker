import type { IsoDate } from '../../domain/types.ts';
import { useAlerts } from '../../app/hooks/useAlerts.ts';
import { alertText, alertTone } from './alertMessages.ts';

/**
 * Active-alerts banner (DESIGN.md §8; SPEC §3.1.4, §3.4). Renders the output of
 * useAlerts — no logic here. `role="alert"` so screen readers announce it;
 * recomputes on any data change (SPEC §6.5.29). Renders nothing when clear.
 */
export function AlertsBanner({
  month,
  today,
  zone,
}: {
  month: string;
  today?: IsoDate;
  zone?: string;
}) {
  const alerts = useAlerts(month, { today, zone });
  if (alerts.length === 0) return null;

  return (
    <div className="alerts" role="alert">
      {alerts.map((a, i) => (
        <div key={`${a.type}-${i}`} className={`alert alert--${alertTone(a.type)}`}>
          {alertText(a)}
        </div>
      ))}
    </div>
  );
}

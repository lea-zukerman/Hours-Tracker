import { formatMinutes } from './format.ts';
import type { Minutes } from '../domain/types.ts';

/**
 * Shows a month balance with a sign and intent color: surplus (positive),
 * deficit (negative), or exactly even. The number uses tabular figures.
 */
export function BalanceBadge({ minutes }: { minutes: Minutes }) {
  const tone = minutes > 0 ? 'positive' : minutes < 0 ? 'negative' : 'zero';
  const arrow = minutes > 0 ? '▲' : minutes < 0 ? '▼' : '•';
  const text = minutes > 0 ? `+${formatMinutes(minutes)}` : formatMinutes(minutes);

  return (
    <span className={`ht-badge ht-badge--${tone}`}>
      <span aria-hidden="true">{arrow}</span>
      <span className="num">{text}</span>
    </span>
  );
}

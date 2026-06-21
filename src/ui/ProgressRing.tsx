import type { ReactNode } from 'react';

/**
 * The signature dial (DESIGN.md §8.1). Draws a circular progress arc with a
 * slot in the center for the headline number. `value` is 0..1 (clamped).
 *
 * Accessible: exposes a progressbar role with the current percentage.
 */
export function ProgressRing({
  value,
  size = 168,
  stroke = 12,
  color = 'var(--accent)',
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped);
  const pct = Math.round(clamped * 100);

  return (
    <div
      className="ht-ring"
      style={{ inlineSize: size, blockSize: size }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <svg className="ht-ring__svg" width={size} height={size} aria-hidden="true">
        <circle className="ht-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="ht-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ht-ring__center">{children}</div>
    </div>
  );
}
